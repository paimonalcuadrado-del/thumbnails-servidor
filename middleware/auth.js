/**
 * Middleware de autenticación por API Key
 * 
 * Verifica que las peticiones incluyan un header 'X-API-Key' válido
 * Las API keys válidas se configuran en la variable de entorno API_KEYS
 * 
 * Formato de API_KEYS: "key1,key2,key3" (separadas por comas)
 * 
 * Ejemplo de uso:
 * app.post('/api/v1/upload', requireApiKey, uploadHandler);
 */

function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  // Verificar que se proporcionó una API key
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key requerida. Incluye el header X-API-Key en tu petición.',
      code: 'MISSING_API_KEY'
    });
  }

  // Obtener las API keys válidas desde variable de entorno
  const validKeys = process.env.API_KEYS ? process.env.API_KEYS.split(',').map(k => k.trim()) : [];
  
  // Si no hay API keys configuradas, denegar acceso
  if (validKeys.length === 0) {
    console.error('⚠️  ADVERTENCIA: No hay API keys configuradas en API_KEYS');
    return res.status(500).json({
      success: false,
      error: 'Servidor no configurado correctamente',
      code: 'SERVER_MISCONFIGURED'
    });
  }

  // Verificar que la API key proporcionada es válida
  if (!validKeys.includes(apiKey)) {
    // No registrar la API key en logs por seguridad
    console.warn('🔒 Intento de acceso con API key inválida');
    return res.status(403).json({
      success: false,
      error: 'API key inválida. Verifica tu clave de acceso.',
      code: 'INVALID_API_KEY'
    });
  }

  // API key válida, continuar con la petición
  next();
}

/**
 * Middleware opcional de API Key
 * Permite el acceso sin API key, pero registra si se proporciona una válida
 * Útil para endpoints que quieres que sean públicos pero también rastreables
 */
function optionalApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (apiKey) {
    const validKeys = process.env.API_KEYS ? process.env.API_KEYS.split(',').map(k => k.trim()) : [];
    if (validKeys.includes(apiKey)) {
      req.isAuthenticated = true;
      req.apiKeyUsed = true;
    }
  }
  
  next();
}

module.exports = {
  requireApiKey,
  optionalApiKey
};
