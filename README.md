# KIA Bot — Gerardo Pineda (Baileys)

Bot de WhatsApp para captura de leads KIA, corriendo con **Baileys** (sin Puppeteer).
Arquitectura parametrizable por asesor: el mismo código sirve para Gerardo, Diana y Bryan
cambiando solo variables de entorno.

---

## 🎯 Qué hace este bot

1. **Cliente escribe primero** → bot saluda, muestra menú (catálogo / cotización / hablar con asesor), y si elige cotizar, ejecuta flujo completo de calificación (interés, presupuesto, empleo, ingresos, centrales, nombre, teléfono) y entrega lead al asesor.
2. **Asesor escribe primero a un cliente nuevo** → bot queda *armado* en silencio. Cuando el cliente responde, el bot aparece con un menú de transición para complementar la atención.
3. **Asesor interrumpe al bot mientras conversa con un cliente** → bot se pausa automáticamente. Después de 48h sin actividad, si el cliente vuelve a escribir, el bot manda un mensaje de reconexión preguntando si quiere seguir con el asesor o ver el menú del bot.

---

## 🏗️ Arquitectura

```
src/
├── index.js                        # Entry point Express + Baileys
├── config/
│   ├── env.js                      # Variables de entorno (con validación)
│   ├── logger.js                   # Winston
│   └── redis.js                    # ioredis singleton
├── services/
│   ├── whatsapp.service.js         # Baileys (WebSocket — sin navegador)
│   └── session.service.js          # Modelo de sesión + ACTIVATION_MODE
├── flows/
│   ├── conversation.flow.js        # Máquina de estados + lógica ARMED/REAWAKEN
│   ├── messages.js                 # Textos parametrizados por asesor
│   └── steps.js                    # Constantes + catálogo KIA
├── routes/
│   └── admin.routes.js             # API del panel
└── admin/
    └── panel.html                  # UI del panel
```

### Modelo de estado de la sesión (Redis)

Cada cliente tiene una sesión con un campo `activationMode` que puede valer:

| Modo                 | Descripción                                                              |
|---------------------|--------------------------------------------------------------------------|
| `ACTIVE`            | Bot respondiendo al flujo normal                                         |
| `ARMED_BY_ADVISOR`  | Asesor escribió primero, bot en silencio esperando respuesta del cliente |
| `PAUSED_BY_ADVISOR` | Asesor interrumpió al bot durante una conversación                       |
| `PAUSED_HANDOFF`    | Flujo de calificación completado, lead entregado                         |
| `PAUSED_ADMIN`      | Pausa manual desde el panel                                              |

Campos adicionales relevantes:

- `lastClientMessageAt`: distingue cliente nuevo (null) vs recurrente
- `pausedAt`: timestamp para la lógica de reawaken a las 48h
- `armedAt`: timestamp del armado (expira a las 72h por defecto)
- `firstContactBy`: `CLIENT` o `ADVISOR` (útil en el panel)

**TTL de sesión en Redis: 45 días por defecto** — así las pausas largas persisten.
Configurable con `SESSION_TTL_MS`.

---

## 🚀 Setup local

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar variables de entorno
cp .env.example .env

# 3. Editar .env con los datos de Gerardo
#    ADVISOR_NAME=Gerardo Pineda
#    ADVISOR_FIRST_NAME=Gerardo
#    ADVISOR_PHONE=573XXXXXXXXX       ← número personal de Gerardo sin +
#    ADVISOR_PORTFOLIO_URL=https://gerardo-pineda.vercel.app/
#    ADMIN_TOKEN=un_token_largo_random
#    REDIS_URL=redis://localhost:6379
#    AUTH_DATA_PATH=./auth

# 4. Levantar Redis local (si no tienes)
docker run -d --name redis -p 6379:6379 redis:alpine

# 5. Iniciar
npm start

# 6. Abrir http://localhost:3000/admin?token=TU_TOKEN
#    y escanear el QR con el WhatsApp de Gerardo
```

---

## ☁️ Deploy en Railway

### Variables de entorno en Railway

Copiar todas las de `.env.example` y completar. **Crítico:**

```
ADVISOR_NAME=Gerardo Pineda
ADVISOR_FIRST_NAME=Gerardo
ADVISOR_PHONE=573XXXXXXXXX
ADVISOR_PORTFOLIO_URL=https://gerardo-pineda.vercel.app/
ADMIN_TOKEN=<token largo random>
REDIS_URL=<lo inyecta Railway al vincular Redis>
AUTH_DATA_PATH=/app/auth
NODE_ENV=production
PORT=3000
```

### 🔴 MUY IMPORTANTE: Volumen persistente

Baileys guarda las credenciales de sesión en archivos. Sin volumen persistente,
cada redeploy te obliga a escanear el QR de nuevo. En Railway:

1. En el servicio → **Settings** → **Volumes**
2. Crear volumen nuevo con:
   - **Mount Path:** `/app/auth`
   - **Size:** 1 GB (suficiente)
3. Redeploy

### ⚠️ No correr 2 instancias del mismo número

Si configuras replicas en Railway, las credenciales se corrompen y WhatsApp devuelve
error 401. Asegúrate de que el servicio tenga **1 única réplica**.

---

## 👥 Replicar el bot para otro asesor (Diana, Bryan, etc.)

La idea: **un servicio por asesor en Railway**, mismo código, distintas env vars.

1. En Railway, duplicar el servicio (o crear uno nuevo desde el mismo repo).
2. Cambiar las variables:
   ```
   ADVISOR_NAME=Diana Carolina Zambrano
   ADVISOR_FIRST_NAME=Diana
   ADVISOR_PHONE=573YYYYYYYYY
   ADVISOR_PORTFOLIO_URL=https://diana-zambrano.vercel.app/
   ADMIN_TOKEN=<otro token distinto>
   ```
3. Crear otro volumen persistente en `/app/auth` (independiente).
4. Si quieres que cada asesor tenga su propio espacio en Redis, prefijar las keys
   con `ADVISOR_FIRST_NAME` — ver sección *Mejoras futuras* más abajo. Por ahora
   usar **una instancia de Redis distinta por bot** es lo más limpio.

---

## 🤔 Cómo se inicia la conversación

Tres escenarios soportados, ordenados por prioridad de detección:

### 1. Cliente escribe primero
```
Cliente: "Hola, quiero info del Seltos"
  ↓
Bot:     "👋 ¡Hola! Soy el asistente de Gerardo Pineda. ..."
Bot:     "¿En qué te puedo ayudar hoy?
          1️⃣ Ver catálogo
          2️⃣ Solicitar cotización
          3️⃣ Hablar con Gerardo"
```
Flujo estándar → califica → entrega lead al asesor.

### 2. Gerardo escribe primero al cliente (caso nuevo)
```
Gerardo: "Hola! Vi que llenaste el formulario web"
  ↓
(bot detecta: sesión no existe O lastClientMessageAt = null)
(bot setea activationMode = ARMED_BY_ADVISOR, queda en silencio)

Gerardo: "¿Qué modelo te interesa?"      ← más mensajes, bot sigue silencioso

[al día siguiente]

Cliente: "Hola Gerardo, me interesa el Niro"
  ↓
(bot detecta ARMED_BY_ADVISOR → se despierta con mensaje de transición)
Bot:     "👋 ¡Hola! Soy el asistente virtual de Gerardo Pineda.
          Mientras Gerardo se conecta contigo, puedo irte ayudando...
          1️⃣ Ver catálogo
          2️⃣ Solicitar cotización
          3️⃣ Seguir esperando a Gerardo"
```
Si el cliente elige 3, el bot queda pausado y sólo se despierta si pasan 48h sin
que Gerardo le escriba al cliente.

### 3. Gerardo interrumpe al bot
```
Cliente:  "quiero info"
Bot:      (inicia flujo...)
Cliente:  "cuánto vale el Seltos"
Bot:      (sigue calificando...)
Gerardo:  "Hola, yo te atiendo"
  ↓
(bot detecta: sesión existe y ya hubo mensaje del cliente)
(bot setea activationMode = PAUSED_BY_ADVISOR, pausedAt = ahora)

[2 días después, si ni Gerardo ni el cliente escriben]

Cliente:  "Sigue disponible?"
  ↓
(bot detecta: pasaron > 48h desde pausedAt → REAWAKEN)
Bot:      "¡Hola de nuevo! Veo que ha pasado un tiempo...
           1️⃣ Seguir hablando con Gerardo
           2️⃣ Ver el catálogo y cotizar"
```

---

## 🧪 Tips para probar

### Simular "asesor escribe primero"

1. Desde el WhatsApp de Gerardo (vinculado al bot), escribir a un contacto nuevo.
2. Revisar en `/admin?token=...` → tabla de sesiones → debería aparecer con tag `🎯 Armado por asesor`.
3. Que el otro número responda cualquier cosa → debería recibir el mensaje de transición con 3 opciones.

### Simular "reawaken a las 48h"

Para no esperar 48h reales, setea `REAWAKEN_AFTER_MS` a un valor chico:
```
REAWAKEN_AFTER_MS=60000        # 1 minuto para pruebas
```
Después flujo: chat normal → escribir desde el celular de Gerardo para pausar →
esperar 1 minuto → escribir desde el cliente → debería aparecer el menú de reconexión.

### Ver logs en Railway
```bash
# En Railway CLI
railway logs
```

---

## 🔧 Endpoints del panel admin

Todos requieren `Authorization: Bearer <ADMIN_TOKEN>` o `?token=...` en la URL.

| Endpoint                        | Método | Descripción                                    |
|--------------------------------|--------|------------------------------------------------|
| `/admin`                       | GET    | Panel HTML                                     |
| `/admin/api/status`            | GET    | Estado (conectado, QR, asesor)                 |
| `/admin/api/sessions`          | GET    | Listar sesiones (ordenadas por prioridad)      |
| `/admin/api/session/pause`     | POST   | Pausar manualmente un cliente                  |
| `/admin/api/session/reactivate`| POST   | Reactivar un cliente pausado                   |
| `/admin/api/session/reset`     | POST   | Borrar sesión (cliente vuelve a cero)          |
| `/admin/api/pause-global`      | POST   | Pausa/activa el bot globalmente                |
| `/admin/api/excluded`          | GET    | Listar números excluidos                       |
| `/admin/api/excluded/add`      | POST   | Agregar número excluido                        |
| `/admin/api/excluded/remove`   | POST   | Quitar número de excluidos                     |
| `/admin/api/relogin`           | POST   | Cierra sesión WhatsApp, genera nuevo QR        |
| `/health`                      | GET    | Healthcheck público (para cron-job.org)        |

---

## 📦 Diferencias clave vs versión anterior (whatsapp-web.js)

| Aspecto              | wwebjs (anterior)                | Baileys (actual)                  |
|---------------------|----------------------------------|-----------------------------------|
| Tecnología          | Chromium headless (Puppeteer)    | WebSocket directo                 |
| RAM                 | ~500 MB                          | ~80 MB                            |
| Arranque            | 15-30s (espera Chrome)           | 2-5s                              |
| Dependencias nativas| chromium, nss, freetype...       | ninguna                           |
| Persistencia auth   | LocalAuth (`/data/wwebjs_auth`)  | Multi-file auth (`/app/auth`)     |
| Detección LID       | inconsistente                    | nativa                            |
| Nixpacks setup      | 4 paquetes (incluye chromium)    | solo `nodejs_20`                  |

---

## 🚨 Troubleshooting

### "El QR aparece pero nunca conecta"
- Asegúrate de que la hora del servidor esté sincronizada (Railway lo hace bien).
- Tu WhatsApp móvil debe tener conexión estable durante el scan.

### "Se desconecta cada rato y pide QR de nuevo"
- Verifica que tengas volumen persistente en `/app/auth`.
- Revisa en Railway que no tengas >1 réplica.
- Si WhatsApp móvil cerró la sesión de "Dispositivos vinculados", tendrás que escanear de nuevo.

### "El asesor escribe y el bot lo pausa aunque no quería"
- Esto NO pasa en el caso cliente-nuevo (ahí arma, no pausa).
- Si pasa en un caso donde el cliente ya había escrito, es el comportamiento correcto.
  Si querés reactivar el bot manualmente, usa el botón "▶ Reactivar" en el panel.

### "Pasaron 2 días y el reawaken no se disparó"
- Verifica el valor de `REAWAKEN_AFTER_MS` en Railway.
- Revisa en el panel la sesión del cliente → el campo `pausedAt` debe tener un valor.
- El reawaken sólo se dispara cuando **el cliente escribe**, no automáticamente.

---

## 🔮 Mejoras futuras (no implementadas)

- **Multi-asesor en una sola instancia**: prefijar keys de Redis con `ADVISOR_FIRST_NAME`
  para correr N asesores en el mismo proceso, cada uno con su propio número de WhatsApp.
  Requiere refactor del módulo `whatsapp.service.js` para manejar múltiples sockets.
- **Botones interactivos de Baileys**: soportados sólo en algunas cuentas; por estabilidad
  seguimos usando opciones numeradas por texto.
- **Analytics**: exportar sesiones y leads a CSV/Excel desde el panel.
- **Notificación proactiva al asesor cuando el bot arma**: hoy sólo notifica al completar lead.

---

Desarrollado por **Vyntra Orbit** 🛰️
# KIA-BOT-Bryan
