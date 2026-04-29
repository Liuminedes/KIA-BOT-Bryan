# 🚗 KIA Bot Bryan — WhatsApp Bot

> Bot de WhatsApp para el asesor comercial **Bryan Losada** de KIA Colombia.  
> Desarrollado por **Vyntra Orbit** con Node.js + Express + Redis sobre Meta Cloud API.

---

## 📋 Flujo de conversación

```
Cliente escribe → Bienvenida → Menú principal
                                    ├── Ver vehículos → Selección modelo → Captura nombre → Presupuesto → Centrales de riesgo → Handoff
                                    ├── Quiero cotización → Captura nombre → Interés → Presupuesto → Centrales de riesgo → Handoff
                                    └── Hablar con Bryan → Handoff directo
```

En cualquier momento el usuario puede escribir `menu` para volver al inicio.

---

## 🏗️ Arquitectura

```
kia-bot-bryan/
├── src/
│   ├── config/
│   │   ├── env.js            # Carga y valida variables de entorno
│   │   ├── logger.js         # Winston (dev: colorido, prod: JSON)
│   │   └── redis.js          # Cliente Redis con reconexión automática
│   ├── controllers/
│   │   └── webhook.controller.js   # GET/POST /webhook
│   ├── flows/
│   │   ├── conversation.flow.js    # Árbol de conversación completo
│   │   ├── messages.js             # Todos los textos del bot centralizados
│   │   └── steps.js                # Constantes, catálogo KIA, opciones
│   ├── middlewares/
│   │   └── security.middleware.js  # Validación HMAC firma Meta
│   ├── routes/
│   │   └── webhook.routes.js
│   ├── services/
│   │   ├── session.service.js      # CRUD de sesiones en Redis
│   │   └── whatsapp.service.js     # Envío de mensajes a Meta API
│   └── index.js                    # Bootstrap del servidor
├── logs/                           # Generado automáticamente
├── .env.example
├── .gitignore
├── package.json
├── railway.json
└── README.md
```

---

## ⚙️ Variables de entorno

Copia `.env.example` como `.env` y completa los valores:

| Variable | Descripción | Ejemplo |
|---|---|---|
| `PORT` | Puerto del servidor | `3000` |
| `NODE_ENV` | Entorno | `development` / `production` |
| `META_VERIFY_TOKEN` | Token inventado por ti para verificar el webhook | `kia_bot_secret_2024` |
| `META_ACCESS_TOKEN` | Token `EAA...` generado en Meta for Developers | `EAAQoi...` |
| `META_PHONE_NUMBER_ID` | ID del número de WA Business | `1066573786537104` |
| `META_API_VERSION` | Versión de la API de Meta | `v22.0` |
| `META_APP_SECRET` | App Secret (opcional, activa validación HMAC) | `e6c4fc...` |
| `REDIS_URL` | URL de Redis (Railway la genera automáticamente) | `redis://...` |
| `ADVISOR_PHONE` | Número de Bryan para notificaciones de handoff | `573001234567` |

---

## 🚀 Setup local

```bash
# 1. Clonar e instalar
git clone https://github.com/Liuminedes/KIA-BOT-Bryan.git
cd KIA-BOT-Bryan/kia-bot-bryan
npm install

# 2. Configurar variables
cp .env.example .env
# Editar .env con tus valores reales

# 3. Levantar Redis local (con Docker)
docker run -d -p 6379:6379 redis:alpine

# 4. Correr en modo desarrollo
npm run dev
```

---

## 🌐 Deploy en Railway

### 1. Conectar el repo
- En Railway: **New Project → Deploy from GitHub repo → KIA-BOT-Bryan**
- Seleccionar la carpeta raíz como `kia-bot-bryan/`

### 2. Agregar Redis
- En el proyecto de Railway: **New Service → Redis**
- Railway inyecta `REDIS_URL` automáticamente

### 3. Variables de entorno en Railway
En **Settings → Variables** agregar:
```
NODE_ENV=production
META_VERIFY_TOKEN=kia_bot_secret_2024
META_ACCESS_TOKEN=EAAQoi...
META_PHONE_NUMBER_ID=1066573786537104
META_APP_SECRET=tu_app_secret
ADVISOR_PHONE=573001234567
```

### 4. Obtener la URL pública
Railway asigna una URL tipo: `https://kia-bot-bryan-production.up.railway.app`

---

## 📡 Configurar el Webhook en Meta

1. Ir a **Meta for Developers → API Leads → WhatsApp → Configuración**
2. En **Webhook URL** poner: `https://TU-URL.railway.app/webhook`
3. En **Verify token** poner el mismo valor de `META_VERIFY_TOKEN`
4. Hacer clic en **Verificar y guardar**
5. Suscribirse al evento **`messages`**

---

## 🧪 Probar localmente con ngrok

```bash
# Exponer puerto local
npx ngrok http 3000

# Usar la URL https://xxxx.ngrok.io/webhook en Meta
```

---

## 📱 Agregar números de prueba en Meta

1. **Meta for Developers → API Leads → WhatsApp → Configuración de API**
2. En **"Para"** → **Administrar números de teléfono**
3. Agregar tu número con código de país (ej: `+57 300 123 4567`)
4. Meta enviará un código de verificación por WhatsApp

---

## 🔄 Palabras clave especiales

| Palabra | Acción |
|---|---|
| `menu`, `inicio`, `volver`, `hola` | Resetea la sesión y muestra el menú |
| `asesor`, `hablar con alguien`, `vendedor` | Activa handoff directo con Bryan |

---

## 📊 Health check

```
GET /health
→ { "status": "ok", "service": "kia-bot-bryan", "env": "production", "timestamp": "..." }
```

---

## 🔧 Expandir a Instagram y Facebook

El webhook ya está preparado para recibir eventos de múltiples canales.  
Para activar Instagram DM y Facebook Messenger solo se requiere:
1. Agregar el canal en Meta for Developers
2. Suscribirse a los eventos en la misma webhook URL
3. El controller ya parsea los eventos correctamente

---

*Desarrollado con ❤️ por Vyntra Orbit para KIA Colombia*
