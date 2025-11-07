require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const NodeCache = require('node-cache');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de CORS
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Configuración de Cloudflare R2 (compatible con S3 API)
const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

// Caché para conversiones WebP -> PNG (45 minutos = 2700 segundos)
const imageCache = new NodeCache({ stdTTL: 2700, checkperiod: 300 });

// Configuración de multer para manejar uploads en memoria
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB máximo
});

// ============================================
// ENDPOINT: Subir imagen (convierte PNG a WebP)
// ============================================
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se proporcionó ninguna imagen' });
    }

    const originalName = req.file.originalname;
    const fileExtension = path.extname(originalName).toLowerCase();
    const baseName = path.basename(originalName, fileExtension);
    
    let processedBuffer = req.file.buffer;
    let finalFileName = originalName;
    let converted = false;
    let originalSize = req.file.size;

    // Convertir PNG a WebP
    if (fileExtension === '.png') {
      processedBuffer = await sharp(req.file.buffer)
        .webp({ quality: 85 })
        .toBuffer();
      
      finalFileName = `${baseName}.webp`;
      converted = true;
    } else if (fileExtension === '.jpg' || fileExtension === '.jpeg') {
      // También convertir JPG a WebP
      processedBuffer = await sharp(req.file.buffer)
        .webp({ quality: 85 })
        .toBuffer();
      
      finalFileName = `${baseName}.webp`;
      converted = true;
    } else if (fileExtension !== '.webp') {
      return res.status(400).json({ 
        success: false, 
        error: 'Solo se permiten archivos PNG, JPG o WebP' 
      });
    }

    const finalSize = processedBuffer.length;
    const reduction = originalSize > 0 ? ((1 - finalSize / originalSize) * 100).toFixed(2) : 0;

    // Subir a Cloudflare R2
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: finalFileName,
      Body: processedBuffer,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000',
    };

    await r2Client.send(new PutObjectCommand(uploadParams));

    // Limpiar caché si existía una versión anterior
    imageCache.del(finalFileName);

    res.json({
      success: true,
      fileName: finalFileName,
      originalName: originalName,
      converted: converted,
      originalSize: originalSize,
      finalSize: finalSize,
      reduction: `${reduction}%`,
      url: `${PUBLIC_URL}/api/image/${finalFileName}`,
      directUrl: `${PUBLIC_URL}/api/image/${finalFileName}?format=webp`
    });

  } catch (error) {
    console.error('Error al subir imagen:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ENDPOINT: Obtener imagen (con conversión opcional y caché)
// ============================================
app.get('/api/image/:fileName', async (req, res) => {
  try {
    const { fileName } = req.params;
    const format = req.query.format || 'png'; // 'png' o 'webp'
    
    // Clave de caché única por archivo y formato
    const cacheKey = `${fileName}_${format}`;

    // Verificar si está en caché
    if (format === 'png') {
      const cachedImage = imageCache.get(cacheKey);
      if (cachedImage) {
        res.set('Content-Type', 'image/png');
        res.set('X-Cache', 'HIT');
        return res.send(cachedImage);
      }
    }

    // Descargar de R2
    const downloadParams = {
      Bucket: BUCKET_NAME,
      Key: fileName,
    };

    const data = await r2Client.send(new GetObjectCommand(downloadParams));
    const imageBuffer = await streamToBuffer(data.Body);

    // Si se solicita WebP y el archivo es WebP, devolver directamente
    if (format === 'webp' && fileName.endsWith('.webp')) {
      res.set('Content-Type', 'image/webp');
      res.set('X-Cache', 'MISS');
      return res.send(imageBuffer);
    }

    // Si se solicita PNG y el archivo es WebP, convertir
    if (format === 'png' && fileName.endsWith('.webp')) {
      const pngBuffer = await sharp(imageBuffer)
        .png()
        .toBuffer();
      
      // Guardar en caché
      imageCache.set(cacheKey, pngBuffer);
      
      res.set('Content-Type', 'image/png');
      res.set('X-Cache', 'MISS');
      return res.send(pngBuffer);
    }

    // Caso por defecto
    const contentType = fileName.endsWith('.webp') ? 'image/webp' : 
                       fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
    res.set('Content-Type', contentType);
    res.set('X-Cache', 'MISS');
    res.send(imageBuffer);

  } catch (error) {
    if (error.name === 'NoSuchKey') {
      return res.status(404).json({ success: false, error: 'Imagen no encontrada' });
    }
    console.error('Error al obtener imagen:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ENDPOINT: Listar todas las imágenes
// ============================================
app.get('/api/images', async (req, res) => {
  try {
    const listParams = {
      Bucket: BUCKET_NAME,
    };

    const data = await r2Client.send(new ListObjectsV2Command(listParams));
    
    const images = (data.Contents || []).map(item => ({
      fileName: item.Key,
      size: item.Size,
      lastModified: item.LastModified,
      url: `${PUBLIC_URL}/api/image/${item.Key}`,
      directUrl: `${PUBLIC_URL}/api/image/${item.Key}?format=webp`
    }));

    res.json({
      success: true,
      count: images.length,
      images: images
    });

  } catch (error) {
    console.error('Error al listar imágenes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ENDPOINT: Eliminar imagen
// ============================================
app.delete('/api/image/:fileName', async (req, res) => {
  try {
    const { fileName } = req.params;

    const deleteParams = {
      Bucket: BUCKET_NAME,
      Key: fileName,
    };

    await r2Client.send(new DeleteObjectCommand(deleteParams));

    // Limpiar caché
    imageCache.del(`${fileName}_png`);
    imageCache.del(`${fileName}_webp`);

    res.json({
      success: true,
      message: `Imagen ${fileName} eliminada correctamente`
    });

  } catch (error) {
    console.error('Error al eliminar imagen:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ENDPOINT: Estado del caché
// ============================================
app.get('/api/cache/stats', (req, res) => {
  const stats = imageCache.getStats();
  res.json({
    success: true,
    stats: {
      keys: stats.keys,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.hits > 0 ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2) + '%' : '0%'
    }
  });
});

// ============================================
// ENDPOINT: Limpiar caché
// ============================================
app.post('/api/cache/clear', (req, res) => {
  imageCache.flushAll();
  res.json({
    success: true,
    message: 'Caché limpiado correctamente'
  });
});

// ============================================
// Función auxiliar para convertir stream a buffer
// ============================================
async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// ============================================
// PÁGINA PRINCIPAL
// ============================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en ${PUBLIC_URL}`);
  console.log(`📦 Bucket R2: ${BUCKET_NAME}`);
  console.log(`⏱️  Caché configurado: 45 minutos por imagen`);
});
