# 🖼️ Servidor de Thumbnails para Geode Mod

Servidor Node.js con Express que convierte automáticamente imágenes PNG/JPG a formato WebP, almacenándolas en Cloudflare R2 con sistema de caché inteligente y autenticación por API key.

## ✨ Características

- 🔄 **Conversión automática** PNG/JPG → WebP al subir imágenes
- ☁️ **Almacenamiento en Cloudflare R2** (compatible con API de S3)
- ⚡ **Caché inteligente** de 45 minutos para conversiones WebP → PNG
- 🔐 **Autenticación por API key** para endpoints críticos
- 🎨 **Interfaz web moderna** con drag & drop
- 📊 **Estadísticas en tiempo real** del caché y almacenamiento
- 🔗 **API versionada** (`/api/v1/`) para mejor mantenibilidad
- 🎮 **Compatible con Geode mod** (Geometry Dash)
- 📱 **Diseño responsive** y animaciones suaves
- 🛡️ **Sistema de moderadores** integrado

## 📚 Documentación

- [🔐 Autenticación por API Key](API_AUTHENTICATION.md) - Cómo generar y usar API keys
- [🎮 Integración con Geode Mod](GEODE_INTEGRATION.md) - Ejemplos en C++ para el mod
- [🛡️ Sistema de Moderadores](MODERATORS.md) - Gestión de moderadores
- [💚 Keep-Alive](KEEP_ALIVE.md) - Mantener el servidor activo en Render

## 🚀 Inicio Rápido

### Requisitos

- Node.js >= 18.0.0
- Cuenta de Cloudflare con R2 configurado
- API key generada (ver [API_AUTHENTICATION.md](API_AUTHENTICATION.md))

### Instalación Local

```bash
# 1. Clonar repositorio
git clone https://github.com/paimonalcuadrado-del/thumbnails-servidor.git
cd thumbnails-servidor

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# 4. Iniciar servidor
npm start
```

El servidor estará disponible en `http://localhost:3000`

### Variables de Entorno

```env
# Cloudflare R2
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=tu_access_key_id
R2_SECRET_ACCESS_KEY=tu_secret_access_key
R2_BUCKET_NAME=tu_bucket_name

# Servidor
PORT=3000
PUBLIC_URL=https://tu-app.onrender.com

# Autenticación (NUEVO)
API_KEYS=tu_api_key_1,tu_api_key_2
```

## 📋 API Endpoints (v1)

### 🔒 Endpoints Protegidos (requieren API key)

#### Subir imagen (multipart/form-data)
```bash
POST /api/v1/upload
Headers: X-API-Key: tu_api_key
Body: multipart/form-data con campo 'image'

Response:
{
  "success": true,
  "fileName": "imagen.webp",
  "originalName": "imagen.png",
  "converted": true,
  "originalSize": 150000,
  "finalSize": 45000,
  "reduction": "70%",
  "url": "https://tu-app.onrender.com/api/v1/image/imagen.webp"
}
```

#### Subir imagen (binario directo - RECOMENDADO para Geode)
```bash
POST /api/v1/upload-direct?fileName=level_123.png
Headers: 
  X-API-Key: tu_api_key
  Content-Type: image/png
Body: <binary PNG data>

Response: (igual que upload multipart)
```

#### Eliminar imagen
```bash
DELETE /api/v1/image/:fileName
Headers: X-API-Key: tu_api_key

Response:
{
  "success": true,
  "message": "Imagen eliminada correctamente"
}
```

#### Limpiar caché
```bash
POST /api/v1/cache/clear
Headers: X-API-Key: tu_api_key

Response:
{
  "success": true,
  "message": "Caché limpiado correctamente"
}
```

#### Recargar moderadores
```bash
POST /api/v1/moderators/reload
Headers: X-API-Key: tu_api_key

Response:
{
  "success": true,
  "message": "Lista de moderadores recargada",
  "count": 5
}
```

### 🌐 Endpoints Públicos (no requieren API key)

#### Obtener imagen
```bash
GET /api/v1/image/:fileName?format=png|webp

# Obtener como PNG (con conversión automática si es WebP)
GET /api/v1/image/imagen.webp?format=png

# Obtener en formato original WebP
GET /api/v1/image/imagen.webp?format=webp
```

#### Listar todas las imágenes
```bash
GET /api/v1/images

Response:
{
  "success": true,
  "count": 5,
  "images": [
    {
      "fileName": "imagen.webp",
      "size": 45000,
      "lastModified": "2024-01-01T12:00:00Z",
      "url": "https://tu-app.onrender.com/api/v1/image/imagen.webp"
    }
  ]
}
```

#### Estadísticas del caché
```bash
GET /api/v1/cache/stats

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

#### Verificar moderador
```bash
GET /api/v1/moderator/check/:username

Response:
{
  "success": true,
  "username": "FlozWer",
  "isModerator": true,
  "message": "Usuario es moderador"
}
```

#### Listar moderadores
```bash
GET /api/v1/moderators

Response:
{
  "success": true,
  "count": 2,
  "moderators": ["flozwer", "gabriv4"]
}
```

#### Health check
```bash
GET /health

Response:
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "uptime": 3600,
  "cache": {
    "keys": 10
  }
}
```

## 🎮 Integración con Geode Mod

### Ejemplo básico en C++

```cpp
#include <Geode/Geode.hpp>
#include <Geode/utils/web.hpp>

using namespace geode::prelude;

const std::string API_KEY = "tu_api_key_aqui";
const std::string SERVER_URL = "https://tu-app.onrender.com";

// Subir thumbnail
void uploadThumbnail(const std::vector<uint8_t>& pngData, const std::string& fileName) {
    std::string url = SERVER_URL + "/api/v1/upload-direct?fileName=" + fileName;
    
    auto req = web::WebRequest();
    req.header("X-API-Key", API_KEY);
    req.header("Content-Type", "image/png");
    req.bodyRaw(pngData);
    
    req.post(url).then([](web::WebResponse* response) {
        if (response->ok()) {
            log::info("Thumbnail subido exitosamente");
        } else {
            log::error("Error al subir: {}", response->code());
        }
    });
}

// Descargar thumbnail (no requiere API key)
void downloadThumbnail(const std::string& fileName) {
    std::string url = SERVER_URL + "/api/v1/image/" + fileName + "?format=png";
    
    auto req = web::WebRequest();
    req.get(url).then([](web::WebResponse* response) {
        if (response->ok()) {
            auto imageData = response->data();
            // Usar imageData para crear textura
        }
    });
}
```

Ver [GEODE_INTEGRATION.md](GEODE_INTEGRATION.md) para ejemplos completos.

## 🛡️ Seguridad

### Autenticación

- Endpoints críticos (upload, delete) protegidos con API key
- Header requerido: `X-API-Key: tu_api_key`
- Endpoints de lectura (get, list) públicos
- Ver [API_AUTHENTICATION.md](API_AUTHENTICATION.md) para más detalles

### Respuestas de Error

```json
// 401 - API key faltante
{
  "success": false,
  "error": "API key requerida. Incluye el header X-API-Key en tu petición.",
  "code": "MISSING_API_KEY"
}

// 403 - API key inválida
{
  "success": false,
  "error": "API key inválida. Verifica tu clave de acceso.",
  "code": "INVALID_API_KEY"
}
```

## 🔄 Migración desde v0 (Legacy)

Los endpoints antiguos aún funcionan sin API key para compatibilidad:
- `/api/upload` → `/api/v1/upload` 
- `/api/image/:fileName` → `/api/v1/image/:fileName`
- `/api/upload-direct` → `/api/v1/upload-direct`

**Recomendación:** Migra a v1 lo antes posible. Los endpoints legacy pueden ser removidos en futuras versiones.

## 🚀 Despliegue en Render

### Configurar Cloudflare R2

1. Ve a tu dashboard de Cloudflare
2. Navega a **R2 Object Storage**
3. Crea un nuevo bucket
4. Genera API token con permisos de lectura/escritura
5. Guarda las credenciales

### Desplegar en Render

1. Ve a [Render.com](https://render.com)
2. Crea nuevo **Web Service**
3. Conecta tu repositorio GitHub
4. Configura:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment Variables**:
     ```
     R2_ENDPOINT=https://[account-id].r2.cloudflarestorage.com
     R2_ACCESS_KEY_ID=tu_access_key
     R2_SECRET_ACCESS_KEY=tu_secret_key
     R2_BUCKET_NAME=tu_bucket
     PUBLIC_URL=https://tu-app.onrender.com
     API_KEYS=genera_una_api_key_segura
     ```
5. Despliega

## 📦 Dependencias

- **express**: Framework web
- **@aws-sdk/client-s3**: Cliente para Cloudflare R2
- **sharp**: Procesamiento de imágenes
- **node-cache**: Sistema de caché
- **multer**: Manejo de uploads
- **dotenv**: Variables de entorno
- **cors**: CORS habilitado

## 🎯 Flujo de Trabajo

1. **Subida**: Mod envía PNG → Servidor convierte a WebP → Sube a R2
2. **Descarga**: Cliente solicita imagen → Servidor descarga de R2 → Convierte si necesario (caché) → Envía
3. **Caché**: Conversiones WebP→PNG cacheadas 45 min

## 📝 Estructura del Proyecto

```
thumbnails-servidor/
├── server.js                  # Servidor principal
├── middleware/
│   └── auth.js               # Middleware de autenticación
├── public/
│   └── index.html            # Interfaz web
├── moderators.txt            # Lista de moderadores
├── package.json              # Dependencias
├── .env.example              # Ejemplo de variables de entorno
├── README.md                 # Este archivo
├── API_AUTHENTICATION.md     # Guía de autenticación
├── GEODE_INTEGRATION.md      # Integración con Geode
├── MODERATORS.md             # Sistema de moderadores
└── KEEP_ALIVE.md             # Keep-alive para Render
```

## 🤝 Contribuir

Las contribuciones son bienvenidas! Por favor:

1. Fork el repositorio
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

MIT - Ver [LICENSE](LICENSE) para más detalles

## 🔗 Enlaces Relacionados

- **Mod de Geode**: https://github.com/paimonalcuadrado-del/Paimon-thumbnails
- **Geode SDK**: https://geode-sdk.org
- **Cloudflare R2**: https://www.cloudflare.com/products/r2/
- **Render**: https://render.com

## ❓ Soporte

- **Issues del servidor**: Abre un issue en este repositorio
- **Issues del mod**: Abre un issue en [Paimon-thumbnails](https://github.com/paimonalcuadrado-del/Paimon-thumbnails)

---

Desarrollado con ❤️ para la comunidad de Geometry Dash

---

Desarrollado con ❤️ para la comunidad de Geometry Dash
