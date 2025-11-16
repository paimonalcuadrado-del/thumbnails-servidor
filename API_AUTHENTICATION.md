# 🔐 Guía de Autenticación por API Key

## Descripción

El servidor ahora usa un sistema de autenticación por API key para proteger endpoints críticos (subir, eliminar imágenes, etc.). Los endpoints de lectura (obtener imágenes, listar) permanecen públicos.

## Generar una API Key

### Método 1: OpenSSL (Recomendado)

```bash
# Generar una API key segura de 32 bytes (64 caracteres hexadecimales)
openssl rand -hex 32
```

### Método 2: Node.js

```javascript
// En Node.js REPL o script
const crypto = require('crypto');
console.log(crypto.randomBytes(32).toString('hex'));
```

### Método 3: Online (menos seguro)

Usar un generador online como:
- https://www.uuidgenerator.net/
- https://randomkeygen.com/

**Ejemplo de API key generada:**
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

## Configurar API Keys en el Servidor

### En desarrollo local (archivo `.env`):

```env
API_KEYS=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

Para múltiples keys (por ejemplo, una para el mod y otra para admins):

```env
API_KEYS=key_del_mod_geode,key_del_admin,key_de_prueba
```

### En Render (Variables de entorno):

1. Ve a tu servicio en Render Dashboard
2. **Environment** → **Environment Variables**
3. Agrega:
   - **Key:** `API_KEYS`
   - **Value:** `tu_api_key_aqui` (o varias separadas por comas)
4. Guarda y redespliega

## Usar la API Key en las Peticiones

### Header Requerido

Todas las peticiones a endpoints protegidos deben incluir:

```
X-API-Key: tu_api_key_aqui
```

## Endpoints Protegidos vs Públicos

### 🔒 Endpoints Protegidos (requieren API key)

- `POST /api/v1/upload` - Subir imagen con multipart
- `POST /api/v1/upload-direct` - Subir PNG binario directo
- `DELETE /api/v1/image/:fileName` - Eliminar imagen
- `POST /api/v1/cache/clear` - Limpiar caché
- `POST /api/v1/moderators/reload` - Recargar moderadores

### 🌐 Endpoints Públicos (no requieren API key)

- `GET /api/v1/image/:fileName` - Obtener imagen
- `GET /api/v1/images` - Listar todas las imágenes
- `GET /api/v1/cache/stats` - Ver estadísticas del caché
- `GET /api/v1/moderator/check/:username` - Verificar moderador
- `GET /api/v1/moderators` - Listar moderadores
- `GET /health` - Health check

## Ejemplos de Uso

### cURL

```bash
# ✅ Subir imagen (con API key)
curl -X POST \
  -H "X-API-Key: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6" \
  -F "image=@thumbnail.png" \
  https://tu-app.onrender.com/api/v1/upload

# ✅ Obtener imagen (sin API key)
curl https://tu-app.onrender.com/api/v1/image/thumbnail.webp?format=png

# ✅ Eliminar imagen (con API key)
curl -X DELETE \
  -H "X-API-Key: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6" \
  https://tu-app.onrender.com/api/v1/image/thumbnail.webp
```

### JavaScript (Fetch)

```javascript
// Subir imagen
const formData = new FormData();
formData.append('image', fileInput.files[0]);

const response = await fetch('https://tu-app.onrender.com/api/v1/upload', {
  method: 'POST',
  headers: {
    'X-API-Key': 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'
  },
  body: formData
});

const result = await response.json();
console.log(result);
```

### C++ (Geode Mod) - Ver GEODE_INTEGRATION.md

Consulta el archivo `GEODE_INTEGRATION.md` para ejemplos específicos del mod de Geode.

## Respuestas de Error

### Sin API Key (401 Unauthorized)

```json
{
  "success": false,
  "error": "API key requerida. Incluye el header X-API-Key en tu petición.",
  "code": "MISSING_API_KEY"
}
```

### API Key Inválida (403 Forbidden)

```json
{
  "success": false,
  "error": "API key inválida. Verifica tu clave de acceso.",
  "code": "INVALID_API_KEY"
}
```

### Servidor No Configurado (500 Internal Server Error)

```json
{
  "success": false,
  "error": "Servidor no configurado correctamente",
  "code": "SERVER_MISCONFIGURED"
}
```

## Seguridad

### ✅ Buenas Prácticas

1. **Nunca compartas tu API key públicamente**
2. **No hagas commit de las API keys en Git** (usa `.env` y `.gitignore`)
3. **Usa API keys diferentes** para desarrollo y producción
4. **Rota las API keys periódicamente** (cada 3-6 meses)
5. **Usa HTTPS siempre** en producción

### ⚠️ Si tu API Key se compromete

1. Genera una nueva API key
2. Actualiza la variable `API_KEYS` en Render
3. Actualiza tu mod de Geode con la nueva key
4. La API key antigua dejará de funcionar inmediatamente

## Migración desde Endpoints Legacy

Los endpoints antiguos (`/api/upload`, `/api/image/:fileName`, etc.) **aún funcionan sin API key** para compatibilidad temporal, pero:

1. Se registran advertencias en los logs
2. Se recomienda migrar a `/api/v1/*` lo antes posible
3. Los endpoints legacy pueden eliminarse en futuras versiones

### Plan de Migración

1. Actualiza el mod de Geode para usar `/api/v1/upload-direct`
2. Agrega el header `X-API-Key` en las peticiones
3. Verifica que todo funciona correctamente
4. Los endpoints legacy se pueden deshabilitar después

## Monitoreo

### Ver intentos de acceso no autorizados

Revisa los logs de Render para detectar intentos con API keys inválidas:

```
🔒 Intento de acceso con API key inválida: 12345678...
```

### Verificar configuración

```bash
# Health check (verifica que el servidor está funcionando)
curl https://tu-app.onrender.com/health
```

---

¿Necesitas ayuda? Abre un issue en el repositorio.
