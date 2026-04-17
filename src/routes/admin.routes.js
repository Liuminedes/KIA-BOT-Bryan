import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { SessionService } from '../services/session.service.js';
import { getQR, isClientReady, WhatsAppService } from '../services/whatsapp.service.js';
import { ACTIVATION_MODE } from '../flows/steps.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== config.admin.token) return res.status(401).json({ error: 'No autorizado' });
  next();
}

// ── Panel HTML (login simple) ─────────────────────────────────────────────────
router.get('/', (req, res) => {
  const token = req.query.token || '';
  if (token !== config.admin.token) {
    return res.send(`
      <html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#0f1117;color:#e2e8f0">
        <form method="get" style="display:flex;flex-direction:column;gap:12px;width:300px">
          <h2 style="color:#BB162B">🔐 KIA Bot Admin</h2>
          <input name="token" type="password" placeholder="Token de acceso" style="padding:10px;border-radius:6px;border:1px solid #2d3148;background:#1a1d27;color:#e2e8f0"/>
          <button style="padding:10px;background:#BB162B;color:white;border:none;border-radius:6px;cursor:pointer">Entrar</button>
        </form>
      </body></html>
    `);
  }
  res.sendFile(path.join(__dirname, '../admin/panel.html'));
});

// ── Status del bot ────────────────────────────────────────────────────────────
router.get('/api/status', auth, async (_req, res) => {
  const qr = getQR();
  const connected = isClientReady();
  const globallyPaused = await SessionService.isGloballyPaused();
  let qrDataUrl = null;
  if (qr) {
    const QRCode = (await import('qrcode')).default;
    qrDataUrl = await QRCode.toDataURL(qr);
  }
  res.json({
    connected,
    qr: qrDataUrl,
    globallyPaused,
    advisor: {
      name: config.advisor.name,
      firstName: config.advisor.firstName,
    },
  });
});

// ── Pausa global ──────────────────────────────────────────────────────────────
router.post('/api/pause-global', auth, async (req, res) => {
  const { paused } = req.body;
  await SessionService.setPausedGlobal(paused);
  logger.info(`[Admin] Bot ${paused ? 'pausado' : 'activado'} globalmente`);
  res.json({ success: true, paused });
});

// ── Listado de sesiones ──────────────────────────────────────────────────────
router.get('/api/sessions', auth, async (_req, res) => {
  const sessions = await SessionService.listActive();
  // Ordenar: primero armadas, luego activas, luego pausadas, por updatedAt desc
  const order = {
    [ACTIVATION_MODE.ARMED_BY_ADVISOR]:  0,
    [ACTIVATION_MODE.ACTIVE]:            1,
    [ACTIVATION_MODE.PAUSED_BY_ADVISOR]: 2,
    [ACTIVATION_MODE.PAUSED_ADMIN]:      3,
    [ACTIVATION_MODE.PAUSED_HANDOFF]:    4,
  };
  sessions.sort((a, b) => {
    const oa = order[a.activationMode] ?? 99;
    const ob = order[b.activationMode] ?? 99;
    if (oa !== ob) return oa - ob;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  res.json({ sessions });
});

router.post('/api/session/pause', auth, async (req, res) => {
  const { userId } = req.body;
  const session = await SessionService.get(userId);
  SessionService.markPausedByAdmin(session);
  await SessionService.save(session);
  logger.info(`[Admin] Sesión pausada: ${userId}`);
  res.json({ success: true });
});

router.post('/api/session/reactivate', auth, async (req, res) => {
  const { userId } = req.body;
  const session = await SessionService.get(userId);
  SessionService.markActive(session, true);
  await SessionService.save(session);
  logger.info(`[Admin] Bot reactivado para: ${userId}`);
  res.json({ success: true });
});

router.post('/api/session/reset', auth, async (req, res) => {
  const { userId } = req.body;
  await SessionService.reset(userId);
  res.json({ success: true });
});

// ── Números excluidos ─────────────────────────────────────────────────────────
router.get('/api/excluded', auth, async (_req, res) => {
  const numbers = await SessionService.getExcludedNumbers();
  res.json({ numbers });
});

router.post('/api/excluded/add', auth, async (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'Número requerido' });
  const numbers = await SessionService.addExcludedNumber(number);
  res.json({ success: true, numbers });
});

router.post('/api/excluded/remove', auth, async (req, res) => {
  const { number } = req.body;
  const numbers = await SessionService.removeExcludedNumber(number);
  res.json({ success: true, numbers });
});

// ── Forzar relogin (limpia auth y reinicia) ──────────────────────────────────
router.post('/api/relogin', auth, async (_req, res) => {
  try {
    await WhatsAppService.logout();
    if (fs.existsSync(config.authPath)) {
      fs.rmSync(config.authPath, { recursive: true, force: true });
      fs.mkdirSync(config.authPath, { recursive: true });
    }
    logger.warn('[Admin] Relogin forzado — reiniciando proceso en 2s');
    res.json({ success: true, message: 'Reiniciando, escanea el nuevo QR en breve.' });
    setTimeout(() => process.exit(0), 2000);
  } catch (err) {
    logger.error(`[Admin] Error en relogin: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

export default router;
