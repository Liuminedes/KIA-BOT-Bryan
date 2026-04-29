import dotenv from 'dotenv';
dotenv.config();

const required = ['REDIS_URL', 'ADMIN_TOKEN'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`[Config] Variable requerida: ${key}`);
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',
  redis: {
    url: process.env.REDIS_URL,
    sessionTTL: 60 * 60 * 6, // 6 horas
  },
  advisor: {
    phone: process.env.ADVISOR_PHONE || null,
  },
  admin: {
    token: process.env.ADMIN_TOKEN,
  },
  // Disco persistente en Render, fallback a /tmp en Railway
  authPath: process.env.AUTH_DATA_PATH || '/data/wwebjs_auth',
};
