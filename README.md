# 🖼️ Servidor de Conversión de Imágenes PNG a WebP

Servidor Node.js con Express que convierte automáticamente imágenes PNG/JPG a formato WebP, almacenándolas en Cloudflare R2 con sistema de caché inteligente para conversiones.

## ✨ Características

- 🔄 **Conversión automática** PNG/JPG → WebP al subir imágenes
- ☁️ **Almacenamiento en Cloudflare R2** (compatible con API de S3)
- ⚡ **Caché inteligente** de 45 minutos para conversiones WebP → PNG
- 🎨 **Interfaz web moderna** con drag & drop
- 📊 **Estadísticas en tiempo real** del caché y almacenamiento
- 🔗 **URLs únicas** para cada imagen
- 📱 **Diseño responsive** y animaciones suaves

## 🚀 Despliegue en Render

### 1. Configurar Cloudflare R2

1. Ve a tu dashboard de Cloudflare
2. Navega a **R2 Object Storage**
3. Crea un nuevo bucket (ej: `image-converter`)
4. Ve a **R2 API tokens** y genera un nuevo token con permisos de lectura/escritura
5. Guarda los siguientes datos:
   - Account ID
   - Access Key ID
   - Secret Access Key
   - Bucket name

### 2. Preparar el repositorio

```bash
# Clonar o crear un repositorio Git
git init
git add .
git commit -m "Initial commit"

# Crear repositorio en GitHub y subir el código
git remote add origin https://github.com/tu-usuario/tu-repo.git
git push -u origin main
```

### 3. Desplegar en Render

1. Ve a [Render.com](https://render.com) y crea una cuenta
2. Haz clic en **New +** → **Web Service**
3. Conecta tu repositorio de GitHub
4. Configura el servicio:
   - **Name**: `image-converter` (o el nombre que prefieras)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free o Starter

5. Agrega las **variables de entorno** en la sección Environment:
   ```
   R2_ENDPOINT=https://[tu-account-id].r2.cloudflarestorage.com
   R2_ACCESS_KEY_ID=tu_access_key_id
   R2_SECRET_ACCESS_KEY=tu_secret_access_key
   R2_BUCKET_NAME=tu_bucket_name
   PUBLIC_URL=https://tu-app.onrender.com
   ```

6. Haz clic en **Create Web Service**

### 4. Verificar el despliegue

Una vez desplegado, tu aplicación estará disponible en `https://tu-app.onrender.com`

## 📋 API Endpoints

### Subir imagen
```bash
POST /api/upload
Content-Type: multipart/form-data
Body: image (file)

Response:
{
  "success": true,
  "fileName": "imagen.webp",
  "originalName": "imagen.png",
  "converted": true,
  "originalSize": 150000,
  "finalSize": 45000,
  "reduction": "70%",
  "url": "https://tu-app.onrender.com/api/image/imagen.webp"
}
```

### Obtener imagen
```bash
GET /api/image/:fileName?format=png|webp

# Obtener como PNG (con conversión automática si es WebP)
GET /api/image/imagen.webp?format=png

# Obtener en formato original WebP
GET /api/image/imagen.webp?format=webp
```

### Listar todas las imágenes
```bash
GET /api/images

Response:
{
  "success": true,
  "count": 5,
  "images": [...]
}
```

### Eliminar imagen
```bash
DELETE /api/image/:fileName

Response:
{
  "success": true,
  "message": "Imagen eliminada correctamente"
}
```

### Estadísticas del caché
```bash
GET /api/cache/stats

Response:
{
  "success": true,
  "stats": {
    "keys": 10,
    "hits": 45,
    "misses": 8,
    "hitRate": "84.9%"
  }
}
```

### Limpiar caché
```bash
POST /api/cache/clear

Response:
{
  "success": true,
  "message": "Caché limpiado correctamente"
}
```

## 🛠️ Desarrollo Local

### Requisitos
- Node.js >= 18.0.0
- Cuenta de Cloudflare con R2 configurado

### Instalación

```bash
# Instalar dependencias
npm install

# Copiar archivo de ejemplo de variables de entorno
cp .env.example .env

# Editar .env con tus credenciales de R2
# R2_ENDPOINT=https://...
# R2_ACCESS_KEY_ID=...
# R2_SECRET_ACCESS_KEY=...
# R2_BUCKET_NAME=...

# Iniciar servidor
npm start
```

El servidor estará disponible en `http://localhost:3000`

## 📦 Dependencias principales

- **express**: Framework web
- **@aws-sdk/client-s3**: Cliente para Cloudflare R2 (compatible con S3)
- **sharp**: Procesamiento y conversión de imágenes
- **node-cache**: Sistema de caché en memoria
- **multer**: Manejo de uploads de archivos
- **dotenv**: Manejo de variables de entorno

## 🎯 Flujo de trabajo

1. **Subida de imagen**:
   - Usuario sube PNG/JPG
   - Sharp convierte a WebP (calidad 85%)
   - Se sube a Cloudflare R2
   - Se retorna URL única

2. **Descarga con conversión**:
   - Cliente solicita imagen (puede especificar formato)
   - Si solicita PNG y está en WebP:
     - Verifica caché (válido por 45 min)
     - Si no está en caché: descarga de R2, convierte a PNG, guarda en caché
     - Si está en caché: retorna directamente
   - Entrega imagen al cliente

3. **Caché automático**:
   - TTL de 45 minutos por imagen
   - Se limpia automáticamente después del TTL
   - Puede limpiarse manualmente desde la interfaz

## 🎨 Interfaz Web

La interfaz incluye:
- **Drag & drop** para subir imágenes
- **Galería visual** de todas las imágenes
- **Estadísticas en tiempo real** del caché
- **Copiar URLs** con un clic
- **Vista previa** de imágenes en modal
- **Gestión completa** (ver, copiar URL, eliminar)

## 🔒 Seguridad

- Validación de tipos de archivo
- Límite de tamaño de archivo (10MB)
- Variables de entorno para credenciales
- CORS habilitado

## 📝 Notas

- El formato WebP reduce el tamaño de las imágenes en ~70% comparado con PNG
- El caché solo se aplica a conversiones WebP → PNG para optimizar rendimiento
- Render puede dormir la aplicación en el plan gratuito después de inactividad
- Considera usar un plan de pago para aplicaciones en producción

## 🤝 Soporte

Para problemas o preguntas, abre un issue en el repositorio.

## 📄 Licencia

MIT
