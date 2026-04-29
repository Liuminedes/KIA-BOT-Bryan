import { logger } from '../config/logger.js';
import { handleMessage } from '../flows/conversation.flow.js';

const ADVISOR_PHONE = process.env.ADVISOR_PHONE || '';
const BRYAN_NUMBER  = process.env.ADVISOR_PHONE || '';

/**
 * GET /webhook — health check
 */
export function verifyWebhook(req, res) {
  return res.status(200).json({ status: 'KIA Bot activo ✅' });
}

/**
 * POST /webhook — Evolution API envía eventos aquí
 */
export async function receiveWebhook(req, res) {
  res.sendStatus(200);

  const body = req.body;
  const event = body?.event || '';

  // Solo procesar mensajes entrantes
  if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') return;

  const data  = body?.data || {};
  const key   = data?.key  || {};

  // Ignorar mensajes enviados por el bot
  if (key?.fromMe) return;

  const message = data?.message || {};
  const rawJid  = key?.remoteJid || '';
  const pushName = data?.pushName || '';

  // Ignorar grupos, canales, broadcasts y estados
  if (
    rawJid.endsWith('@g.us') ||
    rawJid.endsWith('@newsletter') ||
    rawJid.endsWith('@broadcast') ||
    rawJid === 'status@broadcast'
  ) return;

  // Obtener número limpio — funciona con @s.whatsapp.net y @lid
  const userId = rawJid;

  // Ignorar mensajes del asesor para evitar loops
  const phoneClean = rawJid.split('@')[0];
  if (BRYAN_NUMBER && phoneClean === BRYAN_NUMBER) {
    logger.debug(`[Webhook] Mensaje del asesor ignorado: ${userId}`);
    return;
  }

  const text =
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    '';

  if (!text.trim()) return;

  logger.info(`[Webhook] Mensaje recibido`, {
    userId,
    pushName,
    text: text.substring(0, 60),
  });

  handleMessage({ userId, text, pushName }).catch((err) => {
    logger.error(`[Webhook] Error procesando mensaje: ${err.message}`);
  });
}