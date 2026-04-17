import dotenv from 'dotenv';
dotenv.config();

const required = ['REDIS_URL', 'ADMIN_TOKEN', 'ADVISOR_NAME', 'ADVISOR_FIRST_NAME'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`[Config] Variable requerida: ${key}`);
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  redis: {
    url: process.env.REDIS_URL,
    sessionTtlMs: parseInt(process.env.SESSION_TTL_MS || String(45 * 24 * 60 * 60 * 1000), 10),
  },

  advisor: {
    name: process.env.ADVISOR_NAME,
    firstName: process.env.ADVISOR_FIRST_NAME,
    phone: process.env.ADVISOR_PHONE || null,
    portfolioUrl: process.env.ADVISOR_PORTFOLIO_URL || '',
    schedule: process.env.ADVISOR_SCHEDULE || 'L-V 8am–6:30pm | S 8am–3pm',
    segment: process.env.ADVISOR_SEGMENT || 'Segmento Vehículos Nuevos',
  },

  admin: {
    token: process.env.ADMIN_TOKEN,
  },

  // Ruta para persistencia de sesión WhatsApp (Baileys multi-file auth state)
  authPath: process.env.AUTH_DATA_PATH || './auth',

  // Tiempos configurables del bot
  timings: {
    // Pasado este tiempo desde pausedAt, al escribir el cliente se le envía
    // el mensaje de reconexión (default: 48h)
    reawakenAfterMs: parseInt(process.env.REAWAKEN_AFTER_MS || String(48 * 60 * 60 * 1000), 10),
    // Ventana máxima que una sesión puede estar ARMED_BY_ADVISOR sin respuesta
    // antes de considerarse un cliente nuevo (default: 72h)
    armedWindowMs: parseInt(process.env.ARMED_WINDOW_MS || String(72 * 60 * 60 * 1000), 10),
  },
};
