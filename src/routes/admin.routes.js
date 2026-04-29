import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { SessionService } from '../services/session.service.js';
import { savePrices, parseExcelPrices } from '../services/prices.service.js';
import { getQR, isClientReady } from '../services/whatsapp.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== config.admin.token) return res.status(401).json({ error: 'No autorizado' });
  next();
}

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

router.get('/api/status', auth, async (req, res) => {
  const qr = getQR();
  const connected = isClientReady();
  const globallyPaused = await SessionService.isGloballyPaused();
  let qrDataUrl = null;
  if (qr) {
    const QRCode = (await import('qrcode')).default;
    qrDataUrl = await QRCode.toDataURL(qr);
  }
  res.json({ connected, qr: qrDataUrl, globallyPaused });
});

router.post('/api/pause-global', auth, async (req, res) => {
  const { paused } = req.body;
  await SessionService.setPausedGlobal(paused);
  logger.info(`[Admin] Bot ${paused ? 'pausado' : 'activado'} globalmente`);
  res.json({ success: true, paused });
});

router.post('/api/upload-prices', auth, upload.single('excel'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const vehicles = parseExcelPrices(workbook);
    if (!vehicles || vehicles.length === 0) {
      return res.status(400).json({ error: 'El archivo no tiene datos válidos.' });
    }
    await savePrices(vehicles);
    logger.info(`[Admin] Precios actualizados: ${vehicles.length} versiones`);
    res.json({ success: true, count: vehicles.length });
  } catch (err) {
    logger.error(`[Admin] Error subiendo precios: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/sessions', auth, async (req, res) => {
  const sessions = await SessionService.listActive();
  res.json({ sessions });
});

router.post('/api/session/pause', auth, async (req, res) => {
  const { userId } = req.body;
  const session = await SessionService.get(userId);
  session.bryantook = true;
  await SessionService.save(session);
  logger.info(`[Admin] Sesión pausada: ${userId}`);
  res.json({ success: true });
});

router.post('/api/session/reactivate', auth, async (req, res) => {
  const { userId } = req.body;
  const session = await SessionService.get(userId);
  session.bryantook = false;
  session.handoffMode = false;
  session.step = 'WELCOME';
  session.lead = { name: null, phone: null, interest: null, budget: null, employment: null, income: null, creditStatus: null };
  await SessionService.save(session);
  logger.info(`[Admin] Bot reactivado para: ${userId}`);
  res.json({ success: true });
});

router.post('/api/session/reset', auth, async (req, res) => {
  const { userId } = req.body;
  await SessionService.reset(userId);
  res.json({ success: true });
});

// ── Números excluidos ─────────────────────────────────────────────────────
router.get('/api/excluded', auth, async (req, res) => {
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

export default router;