# 🎮 Integración con Geode Mod (C++)

## Descripción

Esta guía explica cómo integrar el mod de Geode con el servidor de thumbnails usando C++ y la API v1 con autenticación.

## Configuración Inicial

### 1. Obtener una API Key

Sigue las instrucciones en `API_AUTHENTICATION.md` para generar y configurar tu API key.

### 2. Almacenar la API Key en el Mod

```cpp
// En tu archivo de configuración del mod
#include <Geode/Geode.hpp>

using namespace geode::prelude;

// Opción 1: Hardcodeada (NO RECOMENDADO para producción)
const std::string API_KEY = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6";

// Opción 2: Desde archivo de configuración (RECOMENDADO)
std::string getApiKey() {
    // Leer desde settings del mod
    return Mod::get()->getSettingValue<std::string>("api-key");
}

// Opción 3: Desde archivo externo
std::string loadApiKeyFromFile() {
    std::ifstream file("config/api-key.txt");
    std::string key;
    if (file.is_open()) {
        std::getline(file, key);
        file.close();
    }
    return key;
}
```

### 3. URL Base del Servidor

```cpp
const std::string SERVER_URL = "https://tu-app.onrender.com";
const std::string API_VERSION = "v1";
```

## Subir una Imagen (PNG → WebP)

### Método Recomendado: Upload Direct (Binario)

Este método es el más eficiente para Geode porque envía el PNG directamente como bytes sin necesidad de multipart/form-data.

```cpp
#include <Geode/Geode.hpp>
#include <Geode/utils/web.hpp>

using namespace geode::prelude;

/**
 * Sube una imagen PNG al servidor
 * @param pngData Buffer con los datos del PNG
 * @param fileName Nombre del archivo (debe terminar en .png)
 * @param callback Función que se llama con el resultado
 */
void uploadThumbnail(
    const std::vector<uint8_t>& pngData,
    const std::string& fileName,
    std::function<void(bool success, std::string response)> callback
) {
    std::string url = SERVER_URL + "/api/v1/upload-direct?fileName=" + fileName;
    
    // Crear la petición web
    auto req = web::WebRequest();
    
    // Configurar headers
    req.header("X-API-Key", API_KEY);
    req.header("Content-Type", "image/png");
    
    // Configurar body (datos binarios del PNG)
    req.bodyRaw(pngData);
    
    // Enviar petición POST
    req.post(url).then([callback](web::WebResponse* response) {
        if (response->ok()) {
            // Éxito - parsear JSON de respuesta
            auto json = response->json();
            if (json.isOk()) {
                auto data = json.unwrap();
                std::string webpUrl = data["url"].asString().unwrapOr("");
                
                log::info("Imagen subida exitosamente: {}", webpUrl);
                callback(true, webpUrl);
            } else {
                log::error("Error al parsear respuesta JSON");
                callback(false, "Error parsing JSON");
            }
        } else {
            // Error
            int statusCode = response->code();
            std::string error = response->string().unwrapOr("Unknown error");
            
            log::error("Error al subir imagen: {} - {}", statusCode, error);
            callback(false, error);
        }
    }).expect([callback](std::string const& error) {
        log::error("Error en petición: {}", error);
        callback(false, error);
    });
}

/**
 * Ejemplo de uso: Subir screenshot de un nivel
 */
void uploadLevelScreenshot(int levelID) {
    // 1. Capturar screenshot (implementación depende de tu mod)
    auto screenshot = captureLevelScreenshot(levelID);
    
    // 2. Convertir a PNG (usando librería como stb_image_write)
    std::vector<uint8_t> pngData = convertToPNG(screenshot);
    
    // 3. Generar nombre de archivo
    std::string fileName = fmt::format("level_{}.png", levelID);
    
    // 4. Subir al servidor
    uploadThumbnail(pngData, fileName, [levelID](bool success, std::string response) {
        if (success) {
            log::info("Thumbnail del nivel {} subido: {}", levelID, response);
            // Guardar URL en tu sistema de datos
            saveThumbnailURL(levelID, response);
        } else {
            log::error("Error al subir thumbnail del nivel {}: {}", levelID, response);
        }
    });
}
```

### Método Alternativo: Multipart/Form-Data

Si prefieres usar multipart (similar a formularios HTML):

```cpp
void uploadThumbnailMultipart(
    const std::vector<uint8_t>& pngData,
    const std::string& fileName,
    std::function<void(bool, std::string)> callback
) {
    std::string url = SERVER_URL + "/api/v1/upload";
    
    auto req = web::WebRequest();
    req.header("X-API-Key", API_KEY);
    
    // Crear multipart form data
    // Nota: Geode puede no tener soporte directo para multipart,
    // en ese caso usar upload-direct es más simple
    
    req.post(url).then([callback](web::WebResponse* response) {
        // Manejar respuesta similar al ejemplo anterior
    });
}
```

## Obtener una Imagen

```cpp
/**
 * Descarga una imagen del servidor
 * @param fileName Nombre del archivo (ej: "level_123.webp")
 * @param format "png" o "webp"
 * @param callback Función que se llama con los datos de la imagen
 */
void downloadThumbnail(
    const std::string& fileName,
    const std::string& format,
    std::function<void(bool success, std::vector<uint8_t> imageData)> callback
) {
    std::string url = fmt::format(
        "{}/api/v1/image/{}?format={}",
        SERVER_URL, fileName, format
    );
    
    // NO se requiere API key para descargar
    auto req = web::WebRequest();
    
    req.get(url).then([callback](web::WebResponse* response) {
        if (response->ok()) {
            // Obtener datos binarios de la imagen
            auto data = response->data();
            callback(true, data);
        } else {
            log::error("Error al descargar imagen: {}", response->code());
            callback(false, {});
        }
    }).expect([callback](std::string const& error) {
        log::error("Error en petición: {}", error);
        callback(false, {});
    });
}

/**
 * Ejemplo de uso: Cargar thumbnail y mostrarlo en el nivel
 */
void loadLevelThumbnail(int levelID) {
    std::string fileName = fmt::format("level_{}.webp", levelID);
    
    downloadThumbnail(fileName, "png", [levelID](bool success, std::vector<uint8_t> data) {
        if (success && !data.empty()) {
            // Convertir datos PNG a textura de Cocos2d-x
            auto texture = createTextureFromPNG(data);
            
            // Mostrar en la UI
            displayThumbnail(levelID, texture);
        } else {
            log::warn("No se pudo cargar thumbnail para nivel {}", levelID);
            // Mostrar imagen por defecto
            displayDefaultThumbnail(levelID);
        }
    });
}
```

## Verificar si un Usuario es Moderador

```cpp
/**
 * Verifica si un usuario es moderador
 * @param username Nombre del usuario
 * @param callback Función que se llama con el resultado
 */
void checkModerator(
    const std::string& username,
    std::function<void(bool isModerator)> callback
) {
    std::string url = fmt::format(
        "{}/api/v1/moderator/check/{}",
        SERVER_URL, username
    );
    
    auto req = web::WebRequest();
    
    req.get(url).then([callback](web::WebResponse* response) {
        if (response->ok()) {
            auto json = response->json();
            if (json.isOk()) {
                auto data = json.unwrap();
                bool isMod = data["isModerator"].asBool().unwrapOr(false);
                callback(isMod);
            } else {
                callback(false);
            }
        } else {
            callback(false);
        }
    }).expect([callback](std::string const& error) {
        log::error("Error verificando moderador: {}", error);
        callback(false);
    });
}

/**
 * Ejemplo de uso: Habilitar funciones especiales para moderadores
 */
void checkUserPermissions() {
    std::string currentUser = GJAccountManager::sharedState()->m_username;
    
    checkModerator(currentUser, [](bool isModerator) {
        if (isModerator) {
            log::info("Usuario es moderador - habilitando funciones especiales");
            enableModeratorFeatures();
        } else {
            log::info("Usuario normal - funciones estándar");
        }
    });
}
```

## Eliminar una Imagen

```cpp
/**
 * Elimina una imagen del servidor
 * @param fileName Nombre del archivo a eliminar
 * @param callback Función que se llama con el resultado
 */
void deleteThumbnail(
    const std::string& fileName,
    std::function<void(bool success)> callback
) {
    std::string url = fmt::format(
        "{}/api/v1/image/{}",
        SERVER_URL, fileName
    );
    
    auto req = web::WebRequest();
    req.header("X-API-Key", API_KEY); // API key requerida
    
    req.del(url).then([callback, fileName](web::WebResponse* response) {
        if (response->ok()) {
            log::info("Imagen {} eliminada exitosamente", fileName);
            callback(true);
        } else {
            log::error("Error al eliminar imagen: {}", response->code());
            callback(false);
        }
    }).expect([callback](std::string const& error) {
        log::error("Error en petición: {}", error);
        callback(false);
    });
}
```

## Manejo de Errores

### Ejemplo Completo con Manejo de Errores

```cpp
void uploadWithRetry(
    const std::vector<uint8_t>& pngData,
    const std::string& fileName,
    int maxRetries = 3
) {
    static int retryCount = 0;
    
    uploadThumbnail(pngData, fileName, [pngData, fileName, maxRetries](bool success, std::string response) {
        if (success) {
            retryCount = 0;
            log::info("Upload exitoso: {}", response);
        } else {
            retryCount++;
            
            if (retryCount < maxRetries) {
                log::warn("Reintentando upload ({}/{})", retryCount, maxRetries);
                
                // Esperar 2 segundos antes de reintentar
                Loader::get()->queueInMainThread([pngData, fileName, maxRetries]() {
                    uploadWithRetry(pngData, fileName, maxRetries);
                }, 2.0f);
            } else {
                retryCount = 0;
                log::error("Upload falló después de {} intentos", maxRetries);
                // Notificar al usuario
                FLAlertLayer::create(
                    "Error",
                    "No se pudo subir la imagen. Verifica tu conexión.",
                    "OK"
                )->show();
            }
        }
    });
}
```

### Verificar Respuestas de Error

```cpp
void handleApiError(web::WebResponse* response) {
    int statusCode = response->code();
    
    switch (statusCode) {
        case 401:
            log::error("API key faltante");
            FLAlertLayer::create("Error", "Configuración inválida del mod", "OK")->show();
            break;
            
        case 403:
            log::error("API key inválida");
            FLAlertLayer::create("Error", "API key inválida. Contacta al desarrollador.", "OK")->show();
            break;
            
        case 404:
            log::warn("Imagen no encontrada");
            break;
            
        case 500:
            log::error("Error del servidor");
            FLAlertLayer::create("Error", "El servidor tuvo un problema. Intenta más tarde.", "OK")->show();
            break;
            
        default:
            log::error("Error desconocido: {}", statusCode);
            break;
    }
}
```

## Optimizaciones

### Caché Local de Thumbnails

```cpp
class ThumbnailCache {
private:
    std::unordered_map<int, CCTexture2D*> cache;
    
public:
    CCTexture2D* get(int levelID) {
        auto it = cache.find(levelID);
        return (it != cache.end()) ? it->second : nullptr;
    }
    
    void set(int levelID, CCTexture2D* texture) {
        cache[levelID] = texture;
    }
    
    void clear() {
        cache.clear();
    }
};

// Uso global
static ThumbnailCache g_thumbnailCache;

void loadThumbnailCached(int levelID) {
    // Verificar caché local primero
    auto cached = g_thumbnailCache.get(levelID);
    if (cached) {
        displayThumbnail(levelID, cached);
        return;
    }
    
    // Si no está en caché, descargar del servidor
    std::string fileName = fmt::format("level_{}.webp", levelID);
    downloadThumbnail(fileName, "png", [levelID](bool success, std::vector<uint8_t> data) {
        if (success) {
            auto texture = createTextureFromPNG(data);
            g_thumbnailCache.set(levelID, texture);
            displayThumbnail(levelID, texture);
        }
    });
}
```

## Configuración del Mod (mod.json)

```json
{
  "geode": "3.0.0",
  "id": "tu.usuario.paimon-thumbnails",
  "name": "Paimon Thumbnails",
  "version": "1.0.0",
  "settings": {
    "api-key": {
      "name": "API Key",
      "description": "Clave de API para el servidor de thumbnails",
      "type": "string",
      "default": ""
    },
    "server-url": {
      "name": "Server URL",
      "description": "URL del servidor de thumbnails",
      "type": "string",
      "default": "https://tu-app.onrender.com"
    }
  }
}
```

## Resumen de Endpoints para Geode

| Método | Endpoint | API Key | Descripción |
|--------|----------|---------|-------------|
| POST | `/api/v1/upload-direct?fileName=X` | ✅ Sí | Subir PNG binario (RECOMENDADO) |
| POST | `/api/v1/upload` | ✅ Sí | Subir con multipart/form-data |
| GET | `/api/v1/image/:fileName?format=png` | ❌ No | Descargar imagen |
| GET | `/api/v1/images` | ❌ No | Listar todas las imágenes |
| DELETE | `/api/v1/image/:fileName` | ✅ Sí | Eliminar imagen |
| GET | `/api/v1/moderator/check/:username` | ❌ No | Verificar moderador |

## Notas Importantes

1. **Siempre usa HTTPS** en producción (`https://tu-app.onrender.com`)
2. **No compartas la API key** en el código fuente público
3. **Implementa rate limiting** en el cliente para no saturar el servidor
4. **Caché local** para reducir peticiones al servidor
5. **Manejo de errores robusto** para mejor experiencia de usuario

## Soporte

- Para problemas del servidor: Abre un issue en `thumbnails-servidor`
- Para problemas del mod: Abre un issue en `Paimon-thumbnails`

---

¡Feliz modding! 🎮
