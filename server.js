require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const NodeCache = require('node-cache');
const path = require('path');
const fs = require('fs').promises;
const { requireApiKey, optionalApiKey } = require('./middleware/auth');

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

// Caché para lista de moderadores (24 horas)
const moderatorCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });
const MODERATORS_FILE = path.join(__dirname, 'moderators.txt');

// Configuración de multer para manejar uploads en memoria
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB máximo
});

// ============================================
// SISTEMA DE MODERADORES
// ============================================

// Leer lista de moderadores desde el archivo
async function loadModerators() {
  try {
    // Verificar si está en caché
    const cached = moderatorCache.get('moderators_list');
    if (cached) {
      return cached;
    }

    // Leer archivo
    const fileContent = await fs.readFile(MODERATORS_FILE, 'utf-8');
    
    // Procesar líneas: remover espacios, líneas vacías y comentarios
    const moderators = fileContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(username => username.toLowerCase()); // Case insensitive

    // Guardar en caché
    moderatorCache.set('moderators_list', moderators);
    
    console.log(`📋 Moderadores cargados: ${moderators.length}`);
    return moderators;
  } catch (error) {
    console.error('Error al leer moderators.txt:', error.message);
    return [];


  }
}

// Verificar si un username es moderador
async function isModerator(username) {
  const moderators = await loadModerators();
  return moderators.includes(username.toLowerCase());
}

// ============================================
// API V1 ENDPOINTS - Nuevos endpoints con autenticación
// ============================================

// V1: Subir imagen con multipart/form-data (protegido con API key)
app.post('/api/v1/upload', requireApiKey, upload.single('image'), async (req, res) => {
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

// V1: Obtener imagen (público - sin API key requerida)
app.get('/api/v1/image/:fileName', async (req, res) => {
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

// V1: Listar todas las imágenes (público - sin API key requerida)
app.get('/api/v1/images', async (req, res) => {
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

// V1: Eliminar imagen (protegido con API key)
app.delete('/api/v1/image/:fileName', requireApiKey, async (req, res) => {
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

// V1: Subir PNG binario directo (protegido con API key)
app.post('/api/v1/upload-direct', requireApiKey, express.raw({ type: 'image/png', limit: '10mb' }), async (req, res) => {
  try {
    let fileName = req.query.fileName || req.headers['x-filename'];
    if (!fileName) {
      return res.status(400).json({ success: false, error: 'fileName es requerido en query o header x-filename' });
    }
    if (!fileName.toLowerCase().endsWith('.png')) {
      return res.status(400).json({ success: false, error: 'Solo se permite subir archivos PNG' });
    }

    const buffer = req.body;
    const originalSize = buffer.length;
    const baseName = require('path').basename(fileName, '.png');

    let processedBuffer = await sharp(buffer)
      .webp({ quality: 85 })
      .toBuffer();
    const finalFileName = `${baseName}.webp`;
    const finalSize = processedBuffer.length;
    const reduction = originalSize > 0 ? ((1 - finalSize / originalSize) * 100).toFixed(2) : 0;

    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: finalFileName,
      Body: processedBuffer,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000',
    };
    await r2Client.send(new PutObjectCommand(uploadParams));
    imageCache.del(finalFileName);

    res.json({
      success: true,
      fileName: finalFileName,
      originalName: fileName,
      converted: true,
      originalSize: originalSize,
      finalSize: finalSize,
      reduction: `${reduction}%`,
      url: `${PUBLIC_URL}/api/v1/image/${finalFileName}`,
      directUrl: `${PUBLIC_URL}/api/v1/image/${finalFileName}?format=webp`
    });
  } catch (error) {
    console.error('Error en upload-direct:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// V1: Estado del caché (público)
app.get('/api/v1/cache/stats', (req, res) => {
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

// V1: Limpiar caché (protegido con API key)
app.post('/api/v1/cache/clear', requireApiKey, (req, res) => {
  imageCache.flushAll();
  res.json({
    success: true,
    message: 'Caché limpiado correctamente'
  });
});

// V1: Verificar moderador (público)
app.get('/api/v1/moderator/check/:username', async (req, res) => {
  try {
    const { username } = req.params;

    if (!username || username.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Username es requerido'
      });
    }

    const isMod = await isModerator(username);

    res.json({
      success: true,
      username: username,
      isModerator: isMod,
      message: isMod ? 'Usuario es moderador' : 'Usuario no es moderador'
    });

  } catch (error) {
    console.error('Error al verificar moderador:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// V1: Listar todos los moderadores (público)
app.get('/api/v1/moderators', async (req, res) => {
  try {
    const moderators = await loadModerators();
    
    res.json({
      success: true,
      count: moderators.length,
      moderators: moderators
    });

  } catch (error) {
    console.error('Error al listar moderadores:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// V1: Recargar lista de moderadores (protegido con API key)
app.post('/api/v1/moderators/reload', requireApiKey, async (req, res) => {
  try {
    // Limpiar caché
    moderatorCache.del('moderators_list');
    
    // Recargar
    const moderators = await loadModerators();
    
    res.json({
      success: true,
      message: 'Lista de moderadores recargada',
      count: moderators.length
    });

  } catch (error) {
    console.error('Error al recargar moderadores:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ENDPOINTS LEGACY (v0) - Mantener compatibilidad temporal
// ============================================

// LEGACY: Subir imagen (mantiene funcionalidad original sin API key para compatibilidad)
app.post('/api/upload', upload.single('image'), async (req, res) => {
  console.warn('⚠️  Usando endpoint legacy /api/upload - Migra a /api/v1/upload');
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

// LEGACY: Obtener imagen
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

// LEGACY: Listar imágenes
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

// LEGACY: Eliminar imagen
app.delete('/api/image/:fileName', async (req, res) => {
  console.warn('⚠️  Usando endpoint legacy /api/image/:fileName DELETE - Migra a /api/v1/image/:fileName');
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

// LEGACY: Estado del caché
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

// LEGACY: Limpiar caché
app.post('/api/cache/clear', (req, res) => {
  console.warn('⚠️  Usando endpoint legacy /api/cache/clear - Migra a /api/v1/cache/clear');
  imageCache.flushAll();
  res.json({
    success: true,
    message: 'Caché limpiado correctamente'
  });
});

// LEGACY: Verificar moderador
app.get('/api/moderator/check/:username', async (req, res) => {
  try {
    const { username } = req.params;

    if (!username || username.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Username es requerido'
      });
    }

    const isMod = await isModerator(username);

    res.json({
      success: true,
      username: username,
      isModerator: isMod,
      message: isMod ? 'Usuario es moderador' : 'Usuario no es moderador'
    });

  } catch (error) {
    console.error('Error al verificar moderador:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// LEGACY: Listar moderadores
app.get('/api/moderators', async (req, res) => {
  try {
    const moderators = await loadModerators();
    
    res.json({
      success: true,
      count: moderators.length,
      moderators: moderators
    });

  } catch (error) {
    console.error('Error al listar moderadores:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// LEGACY: Recargar moderadores
app.post('/api/moderators/reload', async (req, res) => {
  console.warn('⚠️  Usando endpoint legacy /api/moderators/reload - Migra a /api/v1/moderators/reload');
  try {
    // Limpiar caché
    moderatorCache.del('moderators_list');
    
    // Recargar
    const moderators = await loadModerators();
    
    res.json({
      success: true,
      message: 'Lista de moderadores recargada',
      count: moderators.length
    });

  } catch (error) {
    console.error('Error al recargar moderadores:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ENDPOINT: Health check (para keep-alive)
// ============================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    cache: {
      keys: imageCache.getStats().keys
    }
  });
});

// ============================================
// PÁGINA PRINCIPAL
// ============================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// KEEP-ALIVE: Auto-ping cada 10 minutos
// ============================================
function keepAlive() {
  setInterval(async () => {
    try {
      const https = require('https');
      const url = PUBLIC_URL.replace('http://', 'https://');
      
      https.get(`${url}/health`, (res) => {
        console.log(`✅ Keep-alive ping: ${res.statusCode} - ${new Date().toLocaleTimeString()}`);
      }).on('error', (err) => {
        console.error('❌ Keep-alive error:', err.message);
      });
    } catch (error) {
      console.error('❌ Keep-alive failed:', error.message);
    }
  }, 10 * 60 * 1000); // 10 minutos
}

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en ${PUBLIC_URL}`);
  console.log(`📦 Bucket R2: ${BUCKET_NAME}`);
  console.log(`⏱️  Caché configurado: 45 minutos por imagen`);
  console.log(`💚 Keep-alive activado: ping cada 10 minutos`);
  
  // Iniciar keep-alive después de 5 minutos
  setTimeout(keepAlive, 5 * 60 * 1000);
});

// ============================================
// LEGACY: Subir PNG binario directo (sin multipart)
// ============================================
app.post('/api/upload-direct', express.raw({ type: 'image/png', limit: '10mb' }), async (req, res) => {
  console.warn('⚠️  Usando endpoint legacy /api/upload-direct - Migra a /api/v1/upload-direct');
  try {
    let fileName = req.query.fileName || req.headers['x-filename'];
    if (!fileName) {
      return res.status(400).json({ success: false, error: 'fileName es requerido en query o header x-filename' });
    }
    if (!fileName.toLowerCase().endsWith('.png')) {
      return res.status(400).json({ success: false, error: 'Solo se permite subir archivos PNG' });
    }

    const buffer = req.body;
    const originalSize = buffer.length;
    const baseName = require('path').basename(fileName, '.png');

    let processedBuffer = await sharp(buffer)
      .webp({ quality: 85 })
      .toBuffer();
    const finalFileName = `${baseName}.webp`;
    const finalSize = processedBuffer.length;
    const reduction = originalSize > 0 ? ((1 - finalSize / originalSize) * 100).toFixed(2) : 0;

    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: finalFileName,
      Body: processedBuffer,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000',
    };
    await r2Client.send(new PutObjectCommand(uploadParams));
    imageCache.del(finalFileName);

    res.json({
      success: true,
      fileName: finalFileName,
      originalName: fileName,
      converted: true,
      originalSize: originalSize,
      finalSize: finalSize,
      reduction: `${reduction}%`,
      url: `${PUBLIC_URL}/api/image/${finalFileName}`,
      directUrl: `${PUBLIC_URL}/api/image/${finalFileName}?format=webp`
    });
  } catch (error) {
    console.error('Error en upload-direct:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
