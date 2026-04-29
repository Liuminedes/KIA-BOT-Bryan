import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';

let client = null;
let qrCode = null;
let isReady = false;

// Textos enviados por el bot recientemente — para distinguir bot vs Bryan
// Clave: "destinatario|texto_recortado", TTL: 10 segundos
const botSentTexts = new Set();
const BOT_TEXT_TTL = 10_000;

export function getQR() { return qrCode; }
export function isClientReady() { return isReady; }
export function getClient() { return client; }

export async function initWhatsApp(onMessage, onBryanMessage) {
  const puppeteerConfig = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
    ],
  };

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    puppeteerConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: config.authPath }),
    puppeteer: puppeteerConfig,
  });

  client.on('qr', (qr) => {
    qrCode = qr;
    isReady = false;
    logger.info('[WA] QR generado — escanea en /admin');
  });

  client.on('ready', () => {
    isReady = true;
    qrCode = null;
    logger.info('[WA] ✅ WhatsApp conectado y listo');
  });

  client.on('authenticated', () => logger.info('[WA] Autenticado'));

  client.on('auth_failure', (msg) => logger.error(`[WA] Auth failure: ${msg}`));

  client.on('disconnected', (reason) => {
    isReady = false;
    logger.warn(`[WA] Desconectado: ${reason}`);
    setTimeout(() => {
      client.initialize().catch(err => logger.error(`[WA] Reconexión fallida: ${err.message}`));
    }, 5000);
  });

  // ── Mensajes ENTRANTES (del cliente) ────────────────────────────────────────
  client.on('message', async (msg) => {
    try {
      if (msg.fromMe) return;

      // Filtros: ignorar grupos, canales/newsletters, broadcasts y estados.
      // Esto evita que el bot procese mensajes de Noticentro 1, Liga BetPlay,
      // listas de difusión, estados de WhatsApp, etc.
      const from = msg.from || '';
      if (
        from.endsWith('@g.us') ||             // grupos
        from.endsWith('@newsletter') ||       // canales/newsletters
        from.endsWith('@broadcast') ||        // listas de difusión
        from === 'status@broadcast'           // estados de WhatsApp
      ) return;

      // Ignorar tipos de mensaje no conversacionales (estados, reacciones, etc.)
      const tipo = msg.type;
      if (
        tipo === 'e2e_notification' ||
        tipo === 'notification_template' ||
        tipo === 'gp2' ||
        tipo === 'broadcast_notification'
      ) return;

      const text     = msg.body?.trim();
      if (!text) return;

      const userId   = msg.from;
      const pushName = msg._data?.notifyName || '';

      logger.info(`[WA] ← ${userId} (${pushName}): ${text.substring(0, 60)}`);
      await onMessage({ userId, text, pushName });
    } catch (err) {
      logger.error(`[WA] Error en mensaje: ${err.message}`);
    }
  });

  // ── Mensajes SALIENTES — distinguir bot vs Bryan por contenido ─────────────
  client.on('message_create', async (msg) => {
    try {
      if (!msg.fromMe) return;

      // Mismos filtros que en entrantes — Bryan también puede mandar mensajes
      // a grupos/canales/etc, pero no nos interesan.
      const to = msg.to || '';
      if (
        to.endsWith('@g.us') ||
        to.endsWith('@newsletter') ||
        to.endsWith('@broadcast') ||
        to === 'status@broadcast'
      ) return;

      const clientUserId = msg.to;
      const text = msg.body?.trim();
      if (!text) return;

      // Generar clave: destinatario + primeros 80 chars del texto
      const key = `${clientUserId}|${text.substring(0, 80)}`;

      // Si el bot envió este texto recientemente → ignorar
      if (botSentTexts.has(key)) {
        botSentTexts.delete(key);
        return;
      }

      // No es un texto del bot → Bryan escribió manualmente
      logger.info(`[WA] → Bryan escribió a ${clientUserId}: ${text.substring(0, 60)}`);
      await onBryanMessage({ clientUserId });
    } catch (err) {
      logger.error(`[WA] Error en message_create: ${err.message}`);
    }
  });

  await client.initialize();
}

export const WhatsAppService = {
  async sendText(to, text) {
    if (!isReady) {
      logger.warn(`[WA] No listo — no se envió a ${to}`);
      return;
    }
    try {
      // Registrar el texto ANTES de enviar para que message_create lo reconozca
      const key = `${to}|${text.substring(0, 80)}`;
      botSentTexts.add(key);
      setTimeout(() => botSentTexts.delete(key), BOT_TEXT_TTL);

      await client.sendMessage(to, text);
      logger.debug(`[WA] Enviado a ${to}`);
    } catch (err) {
      logger.error(`[WA] Error enviando a ${to}: ${err.message}`);
    }
  },

  sendButtons(to, body, buttons) {
    const opts = buttons.map((b, i) => `${i + 1}️⃣ ${b.title}`).join('\n');
    return this.sendText(to, `${body}\n\n${opts}`);
  },

  sendList(to, body, _label, items) {
    const opts = items.map((item, i) => `${i + 1}️⃣ ${item.title}`).join('\n');
    return this.sendText(to, `${body}\n\n${opts}`);
  },

  markAsRead(_id) { return Promise.resolve(); },
};