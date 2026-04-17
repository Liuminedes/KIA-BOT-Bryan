import express from 'express';
import morgan from 'morgan';
import { config } from './config/env.js';
import { logger } from './config/logger.js';
import { getRedisClient } from './config/redis.js';
import { initWhatsApp } from './services/whatsapp.service.js';
import { handleMessage, handleAdvisorMessage } from './flows/conversation.flow.js';
import adminRoutes from './routes/admin.routes.js';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan(config.isDev ? 'dev' : 'combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// ── Health check (para ping desde cron-job.org) ──────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    advisor: config.advisor.name,
    timestamp: new Date().toISOString(),
  });
});

// ── Admin panel ──────────────────────────────────────────────────────────────
app.use('/admin', adminRoutes);

// ── 404 y error handler ──────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, _req, res, _next) => {
  logger.error(`[Server] Error: ${err.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    const redis = getRedisClient();
    await redis.ping();
    logger.info('[Server] Redis OK');

    app.listen(config.port, () => {
      logger.info(`[Server] KIA Bot — Asesor: ${config.advisor.name}`);
      logger.info(`[Server] Puerto ${config.port} (${config.nodeEnv})`);
      logger.info(`[Server] Admin panel: GET /admin?token=TU_TOKEN`);
      logger.info(`[Server] Health check: GET /health`);
    });

    logger.info('[Server] Iniciando WhatsApp con Baileys...');
    await initWhatsApp(
      // ── Mensaje entrante del cliente ────────────────────────────────────────
      async ({ userId, text, pushName }) => {
        await handleMessage({ userId, text, pushName }).catch(err => {
          logger.error(`[Flow] Error en handleMessage: ${err.message}`);
        });
      },
      // ── Mensaje saliente detectado como manual (asesor escribió) ───────────
      async ({ clientUserId, text }) => {
        await handleAdvisorMessage({ clientUserId, text }).catch(err => {
          logger.error(`[Flow] Error en handleAdvisorMessage: ${err.message}`);
        });
      }
    );

  } catch (err) {
    logger.error(`[Server] Error fatal: ${err.message}`);
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  logger.error(`[Process] uncaughtException: ${err.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`[Process] unhandledRejection: ${reason}`);
});

bootstrap();
