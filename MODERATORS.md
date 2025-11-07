# 🛡️ Sistema de Moderadores

Sistema para verificar si un username es moderador mediante un archivo `moderators.txt`.

## 📋 Configuración

### Archivo `moderators.txt`

Los usernames de moderadores se almacenan en el archivo `moderators.txt` (un username por línea):

```txt
# Lista de Moderadores
# Un username por línea
# Las líneas vacías y que empiezan con # son ignoradas

admin
moderator1
moderator2
JohnDoe
JaneDoe
```

**Características:**
- ✅ Case-insensitive (no importa mayúsculas/minúsculas)
- ✅ Líneas vacías son ignoradas
- ✅ Líneas que empiezan con `#` son comentarios
- ✅ Caché de 24 horas (se recarga automáticamente)

---

## 🔌 Endpoints API

### 1. Verificar si un username es moderador

```http
GET /api/moderator/check/:username
```

**Ejemplo:**
```bash
GET /api/moderator/check/admin
```

**Respuesta (es moderador):**
```json
{
  "success": true,
  "username": "admin",
  "isModerator": true,
  "message": "Usuario es moderador"
}
```

**Respuesta (NO es moderador):**
```json
{
  "success": true,
  "username": "usuario123",
  "isModerator": false,
  "message": "Usuario no es moderador"
}
```

---

### 2. Listar todos los moderadores

```http
GET /api/moderators
```

**Respuesta:**
```json
{
  "success": true,
  "count": 5,
  "moderators": [
    "admin",
    "moderator1",
    "moderator2",
    "johndoe",
    "janedoe"
  ]
}
```

---

### 3. Recargar lista de moderadores

```http
POST /api/moderators/reload
```

**Uso:** Después de editar `moderators.txt`, llama a este endpoint para recargar la lista sin reiniciar el servidor.

**Respuesta:**
```json
{
  "success": true,
  "message": "Lista de moderadores recargada",
  "count": 5
}
```

---

## 💻 Ejemplos de uso

### JavaScript (Fetch API)

```javascript
// Verificar si un usuario es moderador
async function checkModerator(username) {
  const response = await fetch(`https://tu-app.onrender.com/api/moderator/check/${username}`);
  const data = await response.json();
  
  if (data.isModerator) {
    console.log(`${username} es moderador ✅`);
  } else {
    console.log(`${username} NO es moderador ❌`);
  }
  
  return data.isModerator;
}

// Uso
checkModerator('admin'); // true
checkModerator('usuario123'); // false
```

### PowerShell

```powershell
# Verificar moderador
$username = "admin"
$response = Invoke-RestMethod -Uri "https://tu-app.onrender.com/api/moderator/check/$username"
$response.isModerator

# Listar todos los moderadores
$mods = Invoke-RestMethod -Uri "https://tu-app.onrender.com/api/moderators"
$mods.moderators

# Recargar lista
Invoke-RestMethod -Uri "https://tu-app.onrender.com/api/moderators/reload" -Method Post
```

### cURL

```bash
# Verificar moderador
curl https://tu-app.onrender.com/api/moderator/check/admin

# Listar moderadores
curl https://tu-app.onrender.com/api/moderators

# Recargar lista
curl -X POST https://tu-app.onrender.com/api/moderators/reload
```

---

## 📝 Editar lista de moderadores

### Método 1: Editar archivo directamente en Render

1. Ve a tu servicio en Render Dashboard
2. **Shell** (en el menú)
3. Edita el archivo:
   ```bash
   nano moderators.txt
   ```
4. Guarda y sal (Ctrl+X, Y, Enter)
5. Llama al endpoint de reload:
   ```bash
   curl -X POST http://localhost:3000/api/moderators/reload
   ```

### Método 2: Actualizar en GitHub (recomendado)

1. Edita `moderators.txt` en tu repositorio local
2. Commit y push:
   ```bash
   git add moderators.txt
   git commit -m "Update moderators list"
   git push
   ```
3. Render redesplegará automáticamente

---

## 🔒 Seguridad

**Nota:** Este endpoint es público. Si necesitas protegerlo:

1. Agrega autenticación con API key
2. Restringe acceso por IP
3. Usa CORS para limitar orígenes

Ejemplo con API key:
```javascript
app.get('/api/moderator/check/:username', checkApiKey, async (req, res) => {
  // ... código existente
});
```

---

## ⚡ Rendimiento

- **Caché:** La lista se cachea por 24 horas
- **Reload automático:** Después de 24h se recarga automáticamente
- **Reload manual:** Usa `/api/moderators/reload` si editas el archivo

---

¡Sistema de moderadores listo! 🛡️
