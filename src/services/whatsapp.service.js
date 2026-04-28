import baileys from '@whiskeysockets/baileys';
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  makeCacheableSignalKeyStore,
} = baileys;
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';

// ─────────────────────────────────────────────────────────────────────────────
// ESTADO MÓDULO
// ─────────────────────────────────────────────────────────────────────────────
let sock         = null;
let qrCode       = null;
let isReady      = false;
let reconnecting = false;

// Textos enviados por el bot recientemente — para distinguir bot vs asesor.
// Clave: "destinatario|texto_recortado", TTL: 10 segundos
const botSentTexts = new Set();
const BOT_TEXT_TTL = 10_000;

// Logger silencioso para Baileys (muy verboso por defecto)
const baileysLogger = pino({ level: 'silent' });

// ─────────────────────────────────────────────────────────────────────────────
// GETTERS PÚBLICOS
// ─────────────────────────────────────────────────────────────────────────────
export function getQR()          { return qrCode; }
export function isClientReady()  { return isReady; }
export function getSocket()      { return sock; }

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrae texto plano de un mensaje de Baileys (múltiples formatos posibles).
 */
function extractText(message) {
  if (!message) return '';
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.buttonsResponseMessage?.selectedButtonId ||
    message.listResponseMessage?.singleSelectReply?.selectedRowId ||
    message.templateButtonReplyMessage?.selectedId ||
    ''
  ).trim();
}

/**
 * Normaliza un JID (ej: "573001234567@s.whatsapp.net").
 */
function normalizeJid(jid) {
  if (!jid) return '';
  // Remover device suffix (:1, :2) si existe
  return jid.replace(/:[0-9]+@/, '@');
}

/**
 * Extrae solo la parte de identidad del JID (sin sufijo @s.whatsapp.net o @lid).
 * Útil para matching consistente porque el mismo contacto puede llegar a veces
 * como "573001234567@s.whatsapp.net" y otras como "186874496860292@lid".
 */
function extractJidIdentity(jid) {
  if (!jid) return '';
  return normalizeJid(jid).replace(/@.*$/, '');
}

/**
 * Verifica si el JID corresponde al propio asesor (para ignorar sus mensajes).
 */
function isAdvisorJid(jid) {
  if (!config.advisor.phone || !jid) return false;
  const identity = extractJidIdentity(jid);
  return identity === config.advisor.phone;
}

/**
 * Asegura que exista la carpeta de autenticación.
 */
function ensureAuthDir() {
  const dir = config.authPath;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`[WA] Carpeta auth creada: ${dir}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INICIALIZACIÓN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inicializa la conexión con WhatsApp vía Baileys.
 *
 * @param {Function} onMessage        - Callback cuando el cliente escribe
 *                                      ({ userId, text, pushName, messageId })
 * @param {Function} onAdvisorMessage - Callback cuando el asesor escribe a un
 *                                      cliente ({ clientUserId, text })
 */
export async function initWhatsApp(onMessage, onAdvisorMessage) {
  ensureAuthDir();

  const { state, saveCreds } = await useMultiFileAuthState(config.authPath);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger.info(`[WA] Baileys WA Web version: ${version.join('.')} (latest: ${isLatest})`);

  sock = makeWASocket({
    version,
    logger: baileysLogger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
    },
    browser: ['KIA Bot', 'Chrome', '120.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
  });

  // ── Persistencia de credenciales ───────────────────────────────────────────
  sock.ev.on('creds.update', saveCreds);

  // ── Estado de conexión + QR ────────────────────────────────────────────────
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCode = qr;
      isReady = false;
      logger.info('[WA] QR generado — escanea en /admin');
    }

    if (connection === 'open') {
      isReady = true;
      qrCode = null;
      reconnecting = false;
      logger.info('[WA] ✅ WhatsApp conectado y listo');
    }

    if (connection === 'close') {
      isReady = false;
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn(`[WA] Desconectado (code=${statusCode}) — reconectar=${shouldReconnect}`);

      if (statusCode === DisconnectReason.loggedOut) {
        // Sesión cerrada desde el teléfono — hay que limpiar el auth
        logger.error('[WA] Sesión cerrada manualmente. Limpiando credenciales...');
        try {
          fs.rmSync(config.authPath, { recursive: true, force: true });
          fs.mkdirSync(config.authPath, { recursive: true });
        } catch (err) {
          logger.error(`[WA] Error limpiando auth: ${err.message}`);
        }
      }

      if (shouldReconnect && !reconnecting) {
        reconnecting = true;
        setTimeout(() => {
          logger.info('[WA] Reintentando conexión...');
          initWhatsApp(onMessage, onAdvisorMessage).catch(err =>
            logger.error(`[WA] Reconexión fallida: ${err.message}`)
          );
        }, 5000);
      }
    }
  });

  // ── Mensajes (entrantes Y salientes) ───────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' && type !== 'append') return;

    for (const msg of messages) {
      try {
        await handleIncomingMessage(msg, onMessage, onAdvisorMessage);
      } catch (err) {
        logger.error(`[WA] Error procesando mensaje: ${err.message}`);
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER DE MENSAJES
// ─────────────────────────────────────────────────────────────────────────────
async function handleIncomingMessage(msg, onMessage, onAdvisorMessage) {
  // Ignorar mensajes sin contenido
  if (!msg.message) return;

  // Ignorar mensajes de grupos, newsletters, canales y status broadcast
  const jid = msg.key.remoteJid || '';
  if (
    jid.endsWith('@g.us') ||
    jid.endsWith('@newsletter') ||
    jid.endsWith('@broadcast') ||
    jid === 'status@broadcast'
  ) return;

  // Ignorar protocol messages (eliminaciones, ediciones, etc.)
  if (msg.message.protocolMessage) return;

  const text = extractText(msg.message);
  if (!text) return;

  const messageId = msg.key.id;
  const pushName  = msg.pushName || '';

  if (msg.key.fromMe) {
    // ── MENSAJE SALIENTE: el bot o el asesor escribió ───────────────────────
    const clientUserId = normalizeJid(jid);
    const clientIdentity = extractJidIdentity(clientUserId);

    // Si el destino es el propio asesor (ej: notificación de lead), ignorar
    if (isAdvisorJid(clientUserId)) return;

    // Clave: solo identidad numérica + primeros 80 chars del texto.
    // Usamos extractJidIdentity para que matchee consistentemente sin importar
    // si el JID viene como @s.whatsapp.net o @lid.
    const key = `${clientIdentity}|${text.substring(0, 80)}`;

    if (botSentTexts.has(key)) {
      // Fue el bot — ignorar
      botSentTexts.delete(key);
      return;
    }

    // No es del bot → el asesor escribió manualmente
    logger.info(`[WA] → Asesor escribió a ${clientUserId}: ${text.substring(0, 60)}`);
    await onAdvisorMessage({ clientUserId, text });

  } else {
    // ── MENSAJE ENTRANTE: el cliente escribió ───────────────────────────────
    const userId = normalizeJid(jid);

    // Ignorar mensajes del propio asesor (si el asesor se escribe a sí mismo)
    if (isAdvisorJid(userId)) return;

    logger.info(`[WA] ← ${userId} (${pushName}): ${text.substring(0, 60)}`);
    await onMessage({ userId, text, pushName, messageId });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API DE ENVÍO (compatible con la versión anterior)
// ─────────────────────────────────────────────────────────────────────────────
export const WhatsAppService = {

  /**
   * Envía un mensaje de texto. Registra el texto en botSentTexts para que el
   * handler de message_create no lo confunda con un mensaje manual del asesor.
   */
  async sendText(to, text) {
    if (!isReady || !sock) {
      logger.warn(`[WA] No listo — no se envió a ${to}`);
      return;
    }
    try {
      const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
      const identity = extractJidIdentity(jid);

      // Registrar ANTES de enviar para que el echo saliente no dispare
      // onAdvisorMessage por error.
      // Usamos solo la identidad (sin sufijo @s.whatsapp.net o @lid) para que
      // el matching funcione aunque el echo venga con sufijo distinto.
      const key = `${identity}|${text.substring(0, 80)}`;
      botSentTexts.add(key);
      setTimeout(() => botSentTexts.delete(key), BOT_TEXT_TTL);

      await sock.sendMessage(jid, { text });
      logger.debug(`[WA] Enviado a ${jid}`);
    } catch (err) {
      logger.error(`[WA] Error enviando a ${to}: ${err.message}`);
    }
  },

  /**
   * Envía lista de botones como texto numerado (Baileys no soporta botones
   * interactivos de manera estable en cuentas personales).
   */
  sendButtons(to, body, buttons) {
    const opts = buttons.map((b, i) => `${i + 1}️⃣ ${b.title}`).join('\n');
    return this.sendText(to, `${body}\n\n${opts}`);
  },

  sendList(to, body, _label, items) {
    const opts = items.map((item, i) => `${i + 1}️⃣ ${item.title}`).join('\n');
    return this.sendText(to, `${body}\n\n${opts}`);
  },

  /**
   * No-op compatible con la API anterior (Baileys maneja recibos internamente).
   */
  markAsRead(_id) { return Promise.resolve(); },

  /**
   * Cierra la conexión (útil para shutdown limpio).
   */
  async logout() {
    if (sock) {
      try {
        await sock.logout();
      } catch (err) {
        logger.error(`[WA] Error en logout: ${err.message}`);
      }
    }
  },
};