# 🛢️ Monitor de Precios de Nafta

Bot automatizado que monitorea y publica cambios en el precio de la nafta en Argentina, específicamente para estaciones de servicio YPF.

## 📊 Características

- **Monitoreo diario**: Verifica cambios de precio automáticamente
- **Comparativa mensual**: Calcula variaciones de precio de los últimos 30 días
- **Notificaciones múltiples**: Publica en X (Twitter) y envía alertas por Telegram
- **Historial persistente**: Mantiene registro completo de cambios en GitHub

## 🚀 Configuración

### Requisitos previos

- Python 3.8+
- Cuenta de X (Twitter) con API access
- Bot de Telegram (opcional)
- Cuenta de GitHub

### Instalación

1. Clona el repositorio:
```bash
git clone https://github.com/TU_USUARIO/nafta-price-monitor.git
cd nafta-price-monitor
```

2. Instala las dependencias:
```bash
pip install -r requirements.txt
```

3. Configura las variables de entorno (ver sección siguiente)

### Variables de Entorno

Crea un archivo `.env` con las siguientes variables:

```env
# Twitter/X API
X_API_KEY=tu_api_key
X_API_SECRET=tu_api_secret
X_ACCESS_TOKEN=tu_access_token
X_ACCESS_SECRET=tu_access_secret
X_BEARER_TOKEN=tu_bearer_token

# Telegram (opcional)
TELEGRAM_BOT_TOKEN=tu_bot_token
TELEGRAM_CHAT_ID=tu_chat_id
```

**⚠️ IMPORTANTE**: Nunca subas el archivo `.env` a GitHub. Ya está incluido en `.gitignore`.

### Configuración de GitHub Actions

Para ejecutar el bot automáticamente:

1. Ve a tu repositorio en GitHub
2. Settings → Secrets and variables → Actions
3. Agrega cada variable de entorno como un "Repository secret"

## 📁 Estructura del Proyecto

```
nafta-price-monitor/
├── .github/
│   └── workflows/
│       └── monitor.yml          # Workflow de GitHub Actions
├── data/
│   └── historico_precios.csv    # Base de datos histórica
├── nafta_tracker.py             # Script principal
├── requirements.txt             # Dependencias
├── .gitignore                   # Archivos ignorados
├── .env.example                 # Plantilla de variables
└── README.md                    # Este archivo
```

## 🔧 Uso

### Ejecución manual

```bash
python nafta_tracker.py
```

### Ejecución automática

El bot se ejecuta automáticamente cada día a las 8:00 AM (hora de Argentina) mediante GitHub Actions.

Puedes modificar el horario editando `.github/workflows/monitor.yml`:

```yaml
schedule:
  - cron: '0 11 * * *'  # 8:00 AM Argentina (UTC-3)
```

## 📈 Fuente de Datos

**Desde noviembre 2026** la fuente oficial del Ministerio de Energía dejó de actualizarse de forma confiable (Res. 717/2025 derogó la 314/2016).

Ahora el precio se obtiene de la estación **GAS IMPULSO SA (apies 00322)** – Nafta Súper (`pvp_NS`) a través del pipeline:

1. En el runner self-hosted debe existir el archivo `estaciones_ypf_final.json`
2. El workflow ejecuta `ypf.py` → genera `estaciones_ypf_final_con_tasa.csv`
3. `nafta_tracker.py` lee el `pvp_NS` de la estación 00322

Si el JSON no está presente, el tracker intenta usar el CSV/JSON ya generado en ejecuciones anteriores.

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📝 Licencia

Este proyecto está bajo la Licencia MIT. Ver archivo `LICENSE` para más detalles.

## 📧 Contacto

Si tienes preguntas o sugerencias, abre un Issue en el repositorio.

---

**Nota**: Este bot es solo para fines informativos. Los precios oficiales deben verificarse directamente en las estaciones de servicio.

---

## 🔄 Historial de cambios de estación / fuente

| Fecha | Cambio | Motivo |
|-------|--------|--------|
| 15/05/2025 | Se reemplazó UNITECPROCOM SA por **GAS IMPULSO S.A.** (Ruta 25 Nro. 619, Pilar, Buenos Aires) | Suspensión de datos de la estación anterior |
| 17/11/2026 | Cambio de fuente: se deja de usar el CSV del Ministerio. Ahora se usa el pipeline YPF (\`ypf.py\` + estación apies **00322** – Nafta Súper) | Res. 717/2025 dejó de obligar el reporte de precios; los datos oficiales dejaron de actualizarse |