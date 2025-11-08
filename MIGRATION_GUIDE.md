# 📋 Guía de Migración a API v1

## Resumen de Cambios

Esta versión introduce:
- ✨ Sistema de autenticación por API key
- 🔄 Endpoints versionados (`/api/v1/`)
- 🔐 Protección de endpoints críticos
- 📚 Documentación completa
- 🛡️ Mejoras de seguridad

## ¿Necesito Migrar?

**No inmediatamente**. Los endpoints legacy (`/api/*`) siguen funcionando sin cambios:
- ✅ **Sin API key requerida** (por ahora)
- ✅ **Sin cambios de comportamiento**
- ⚠️ **Advertencias en logs** del servidor

**Pero se recomienda migrar** porque:
- Los endpoints legacy pueden deprecarse en futuras versiones
- Los nuevos endpoints tienen mejor seguridad
- Tendrás acceso a nuevas funcionalidades

## Migración Paso a Paso

### Para Usuarios del Mod de Geode

#### Paso 1: Obtener una API Key

1. Contacta al administrador del servidor para obtener tu API key
2. O si eres el administrador, genera una:
   ```bash
   openssl rand -hex 32
   ```

#### Paso 2: Actualizar el Mod

**Código Anterior** (sin API key):
```cpp
void uploadThumbnail(const std::vector<uint8_t>& pngData, const std::string& fileName) {
    std::string url = SERVER_URL + "/api/upload-direct?fileName=" + fileName;
    
    auto req = web::WebRequest();
    req.header("Content-Type", "image/png");
    req.bodyRaw(pngData);
    
    req.post(url).then([](web::WebResponse* response) {
        // Handle response
    });
}
```

**Código Nuevo** (con API key):
```cpp
const std::string API_KEY = "tu_api_key_aqui"; // O desde configuración

void uploadThumbnail(const std::vector<uint8_t>& pngData, const std::string& fileName) {
    std::string url = SERVER_URL + "/api/v1/upload-direct?fileName=" + fileName;
    
    auto req = web::WebRequest();
    req.header("X-API-Key", API_KEY);  // ← NUEVO
    req.header("Content-Type", "image/png");
    req.bodyRaw(pngData);
    
    req.post(url).then([](web::WebResponse* response) {
        // Handle response (mismo formato)
    });
}
```

#### Paso 3: Actualizar Todas las Llamadas

| Endpoint Legacy | Endpoint v1 | Requiere API Key |
|----------------|-------------|------------------|
| `POST /api/upload` | `POST /api/v1/upload` | ✅ Sí |
| `POST /api/upload-direct` | `POST /api/v1/upload-direct` | ✅ Sí |
| `GET /api/image/:fileName` | `GET /api/v1/image/:fileName` | ❌ No |
| `GET /api/images` | `GET /api/v1/images` | ❌ No |
| `DELETE /api/image/:fileName` | `DELETE /api/v1/image/:fileName` | ✅ Sí |
| `GET /api/cache/stats` | `GET /api/v1/cache/stats` | ❌ No |
| `POST /api/cache/clear` | `POST /api/v1/cache/clear` | ✅ Sí |
| `GET /api/moderator/check/:user` | `GET /api/v1/moderator/check/:user` | ❌ No |
| `GET /api/moderators` | `GET /api/v1/moderators` | ❌ No |
| `POST /api/moderators/reload` | `POST /api/v1/moderators/reload` | ✅ Sí |

#### Paso 4: Manejo de Errores

Agrega manejo para los nuevos códigos de error:

```cpp
req.post(url).then([](web::WebResponse* response) {
    if (response->ok()) {
        // Éxito
        log::info("Upload exitoso");
    } else {
        int code = response->code();
        
        if (code == 401) {
            // API key faltante
            FLAlertLayer::create(
                "Error", 
                "Configuración inválida. Contacta al desarrollador.", 
                "OK"
            )->show();
        } else if (code == 403) {
            // API key inválida
            FLAlertLayer::create(
                "Error", 
                "API key inválida. Actualiza el mod.", 
                "OK"
            )->show();
        } else {
            // Otro error
            log::error("Error: {}", code);
        }
    }
});
```

### Para Usuarios de la Interfaz Web

La interfaz web se actualizará automáticamente. No se requiere acción del usuario.

### Para Administradores del Servidor

#### Paso 1: Configurar API Keys

1. **Generar API Keys**:
   ```bash
   # Generar una API key para el mod
   openssl rand -hex 32
   
   # Generar otra para administradores
   openssl rand -hex 32
   ```

2. **Configurar en Render**:
   - Ve a tu servicio en Render
   - **Environment** → **Environment Variables**
   - Agrega o actualiza:
     ```
     API_KEYS=key_del_mod_1234,key_admin_5678
     ```
   - Guarda y redespliega

3. **Distribuir API Keys**:
   - Envía la API key del mod a los desarrolladores
   - Guarda la API key de admin de forma segura
   - **NO compartas las keys públicamente**

#### Paso 2: Verificar el Despliegue

1. Test de health check:
   ```bash
   curl https://tu-app.onrender.com/health
   ```

2. Test de endpoint protegido (debe fallar sin API key):
   ```bash
   curl -X POST https://tu-app.onrender.com/api/v1/upload
   # Debe retornar: {"success":false,"error":"API key requerida...","code":"MISSING_API_KEY"}
   ```

3. Test con API key:
   ```bash
   curl -X GET \
     -H "X-API-Key: tu_api_key_aqui" \
     https://tu-app.onrender.com/api/v1/cache/stats
   ```

#### Paso 3: Monitorear Logs

Revisa los logs de Render para:
- ✅ Verificar que no hay errores al iniciar
- ⚠️ Ver advertencias de uso de endpoints legacy
- 🔒 Detectar intentos de acceso no autorizado

```
🚀 Servidor ejecutándose en https://tu-app.onrender.com
📦 Bucket R2: tu_bucket_name
⏱️  Caché configurado: 45 minutos por imagen
💚 Keep-alive activado: ping cada 10 minutos

⚠️  Usando endpoint legacy /api/upload - Migra a /api/v1/upload
🔒 Intento de acceso con API key inválida
```

## Problemas Comunes y Soluciones

### "API key requerida" (401)

**Problema**: Olvidaste incluir el header `X-API-Key`

**Solución**:
```cpp
req.header("X-API-Key", API_KEY);
```

### "API key inválida" (403)

**Problema**: La API key está mal escrita o no está configurada en el servidor

**Solución**:
1. Verifica que la API key sea exactamente igual
2. Verifica que esté en la variable `API_KEYS` del servidor
3. No debe tener espacios ni saltos de línea

### "Servidor no configurado correctamente" (500)

**Problema**: No hay API keys configuradas en el servidor

**Solución**:
1. Agrega `API_KEYS` a las variables de entorno
2. Redespliega el servidor

### Endpoints legacy aún funcionan sin API key

**Respuesta**: Esto es intencional para compatibilidad. Pero:
- Se registran advertencias en los logs
- Pueden deprecarse en futuras versiones
- Migra a v1 lo antes posible

## Timeline de Deprecación

| Fecha | Acción |
|-------|--------|
| **2025-11** | Lanzamiento de API v1. Endpoints legacy funcionan sin cambios |
| **2026-02** | Endpoints legacy requieren API key (breaking change) |
| **2026-05** | Endpoints legacy removidos completamente |

**Nota**: Las fechas son aproximadas y se notificarán con anticipación.

## Rollback

Si encuentras problemas con la migración:

1. **Los endpoints legacy siguen funcionando** - No necesitas hacer rollback
2. **Reporta el issue** en GitHub con detalles
3. **Podemos ayudarte** con la migración

## Checklist de Migración

Para el **Mod de Geode**:
- [ ] Obtener API key del administrador
- [ ] Actualizar código para usar `/api/v1/upload-direct`
- [ ] Agregar header `X-API-Key`
- [ ] Actualizar manejo de errores (401, 403)
- [ ] Probar en desarrollo
- [ ] Probar en producción
- [ ] Actualizar versión del mod
- [ ] Notificar a usuarios de la actualización

Para **Administradores**:
- [ ] Generar API keys seguras
- [ ] Configurar `API_KEYS` en variables de entorno
- [ ] Verificar despliegue
- [ ] Distribuir API keys a desarrolladores
- [ ] Monitorear logs
- [ ] Documentar API keys de forma segura

## Soporte

¿Necesitas ayuda con la migración?

- **Issues**: https://github.com/paimonalcuadrado-del/thumbnails-servidor/issues
- **Documentación**: 
  - [API_AUTHENTICATION.md](API_AUTHENTICATION.md)
  - [GEODE_INTEGRATION.md](GEODE_INTEGRATION.md)

---

**Última actualización**: 2025-11-08
