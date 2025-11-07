# 💚 Keep-Alive para Render (Plan Free)

El servidor incluye un sistema de **auto-ping cada 10 minutos** para mantenerse activo y evitar que Render lo duerma después de 15 minutos de inactividad.

## ✅ Sistema integrado (Interno)

El servidor se hace ping a sí mismo cada 10 minutos automáticamente.

**Endpoint de health check:**
```
GET https://tu-app.onrender.com/health
```

**Respuesta:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-07T12:34:56.789Z",
  "uptime": 3600,
  "cache": {
    "keys": 5
  }
}
```

## 🌐 Servicios externos (Opcional - Más confiable)

Para mayor confiabilidad, puedes usar servicios externos gratuitos que hagan ping a tu servidor:

### **Opción 1: UptimeRobot (Recomendado)**

1. Ve a [uptimerobot.com](https://uptimerobot.com)
2. Crea una cuenta gratuita
3. Clic en **"Add New Monitor"**
4. Configura:
   ```
   Monitor Type: HTTP(s)
   Friendly Name: Image Converter
   URL: https://tu-app.onrender.com/health
   Monitoring Interval: 5 minutes (gratis)
   ```
5. Clic en **"Create Monitor"**

✅ **Ventajas:**
- Dashboard con estadísticas de uptime
- Alertas por email si el servidor cae
- Ping cada 5 minutos
- Completamente gratuito

### **Opción 2: Cron-job.org**

1. Ve a [cron-job.org](https://cron-job.org)
2. Crea una cuenta gratuita
3. Clic en **"Create cronjob"**
4. Configura:
   ```
   Title: Keep Alive Image Server
   URL: https://tu-app.onrender.com/health
   Execution: Every 10 minutes
   ```
5. Clic en **"Create"**

### **Opción 3: Healthchecks.io**

1. Ve a [healthchecks.io](https://healthchecks.io)
2. Crea una cuenta gratuita
3. Crea un nuevo check
4. Usa la URL de ping proporcionada

## 🚨 Limitaciones del Plan Free de Render

- **Tiempo de inactividad:** 15 minutos sin requests → servidor se duerme
- **Tiempo de arranque:** 30-60 segundos en la primera request después de dormir
- **Horas mensuales:** 750 horas/mes gratis (suficiente si solo tienes 1 servicio)

## 💡 Recomendación

**Usa el sistema interno + UptimeRobot** para máxima confiabilidad:
- Sistema interno: ping cada 10 minutos
- UptimeRobot: ping cada 5 minutos + monitoreo
- Resultado: servidor siempre activo y monitoreado

## 🔄 Actualizar código

Si ya desplegaste en Render y acabas de agregar el keep-alive:

```bash
# Hacer commit de los cambios
git add .
git commit -m "Add keep-alive system"
git push

# Render redesplegará automáticamente
```

## 📊 Verificar que funciona

Revisa los logs en Render Dashboard, deberías ver:

```
✅ Keep-alive ping: 200 - 12:34:56 PM
✅ Keep-alive ping: 200 - 12:44:56 PM
✅ Keep-alive ping: 200 - 12:54:56 PM
```

---

¡Tu servidor ahora se mantendrá despierto 24/7! 🚀
