import { getRedisClient } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';
import { ACTIVATION_MODE, PAUSED_MODES, STEPS } from '../flows/steps.js';

const PREFIX          = 'kia:session:';
const PAUSED_PREFIX   = 'kia:paused:';          // pausa global por admin
const EXCLUDED_KEY    = 'kia:excluded';

// TTL en segundos (ioredis setex usa segundos)
const TTL_SEC = Math.floor(config.redis.sessionTtlMs / 1000);

// ─────────────────────────────────────────────────────────────────────────────
// MODELO DE SESIÓN POR DEFECTO
// ─────────────────────────────────────────────────────────────────────────────
function defaultSession(userId) {
  return {
    userId,
    pushName: null,
    step: STEPS.WELCOME,
    lead: {
      name: null,
      phone: null,
      interest: null,
      budget: null,
      employment: null,
      income: null,
      creditStatus: null,
    },
    activationMode: ACTIVATION_MODE.ACTIVE,
    // Timestamps del ciclo de vida
    createdAt:            Date.now(),
    updatedAt:            Date.now(),
    lastClientMessageAt:  null,  // última vez que el cliente escribió
    pausedAt:             null,  // cuándo quedó en algún estado pausado
    armedAt:              null,  // cuándo el asesor activó ARMED_BY_ADVISOR
    // Quién inició el contacto: 'CLIENT' o 'ADVISOR'
    firstContactBy:       null,
    // Flag interno para flujo handoff directo
    pendingDirectHandoff: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MIGRACIÓN: sesiones viejas con bryantook/handoffMode → activationMode
// Se aplica automáticamente al leer cada sesión.
// ─────────────────────────────────────────────────────────────────────────────
function migrateLegacySession(session) {
  // Ya está en formato nuevo
  if (session.activationMode) return session;

  let mode = ACTIVATION_MODE.ACTIVE;
  if (session.bryantook)   mode = ACTIVATION_MODE.PAUSED_BY_ADVISOR;
  if (session.handoffMode) mode = ACTIVATION_MODE.PAUSED_HANDOFF;

  session.activationMode = mode;
  session.createdAt            = session.createdAt            || session.updatedAt || Date.now();
  session.lastClientMessageAt  = session.lastClientMessageAt  || null;
  session.pausedAt             = PAUSED_MODES.has(mode) ? (session.updatedAt || Date.now()) : null;
  session.armedAt              = null;
  session.firstContactBy       = session.firstContactBy       || 'CLIENT';
  session.pendingDirectHandoff = session.pendingDirectHandoff || false;

  // Limpiar campos viejos (ya mapeados)
  delete session.bryantook;
  delete session.handoffMode;

  return session;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICIO PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export const SessionService = {

  async get(userId) {
    const redis = getRedisClient();
    try {
      const raw = await redis.get(`${PREFIX}${userId}`);
      if (!raw) return defaultSession(userId);
      return migrateLegacySession(JSON.parse(raw));
    } catch (err) {
      logger.error(`[Session] get error: ${err.message}`);
      return defaultSession(userId);
    }
  },

  // Verifica si existe la sesión (distinto de get — get siempre devuelve objeto)
  async exists(userId) {
    const redis = getRedisClient();
    try {
      return (await redis.exists(`${PREFIX}${userId}`)) === 1;
    } catch (err) {
      logger.error(`[Session] exists error: ${err.message}`);
      return false;
    }
  },

  async save(session) {
    const redis = getRedisClient();
    try {
      session.updatedAt = Date.now();
      await redis.setex(`${PREFIX}${session.userId}`, TTL_SEC, JSON.stringify(session));
    } catch (err) {
      logger.error(`[Session] save error: ${err.message}`);
    }
  },

  async reset(userId) {
    const redis = getRedisClient();
    try {
      await redis.del(`${PREFIX}${userId}`);
      logger.info(`[Session] Reset: ${userId}`);
    } catch (err) {
      logger.error(`[Session] reset error: ${err.message}`);
    }
  },

  // ── Helpers de transición de estado ────────────────────────────────────────

  // El cliente acaba de escribir — actualizar timestamp
  markClientMessage(session) {
    session.lastClientMessageAt = Date.now();
    if (!session.firstContactBy) session.firstContactBy = 'CLIENT';
  },

  // El asesor interrumpió al bot mientras ya conversaba con el cliente
  markPausedByAdvisor(session) {
    session.activationMode = ACTIVATION_MODE.PAUSED_BY_ADVISOR;
    session.pausedAt       = Date.now();
    session.armedAt        = null;
  },

  // El asesor escribió primero a un cliente nuevo — bot queda armado
  markArmedByAdvisor(session) {
    session.activationMode = ACTIVATION_MODE.ARMED_BY_ADVISOR;
    session.armedAt        = Date.now();
    session.pausedAt       = null;
    if (!session.firstContactBy) session.firstContactBy = 'ADVISOR';
  },

  // Flujo de calificación completado — lead entregado
  markHandoffCompleted(session) {
    session.activationMode = ACTIVATION_MODE.PAUSED_HANDOFF;
    session.step           = STEPS.HANDOFF;
    session.pausedAt       = Date.now();
  },

  // Admin pausó manualmente desde el panel
  markPausedByAdmin(session) {
    session.activationMode = ACTIVATION_MODE.PAUSED_ADMIN;
    session.pausedAt       = Date.now();
    session.armedAt        = null;
  },

  // Volver al estado activo (reset suave sin perder pushName/firstContactBy)
  markActive(session, resetLead = true) {
    session.activationMode = ACTIVATION_MODE.ACTIVE;
    session.pausedAt       = null;
    session.armedAt        = null;
    session.step           = STEPS.WELCOME;
    if (resetLead) {
      session.lead = {
        name: null, phone: null, interest: null, budget: null,
        employment: null, income: null, creditStatus: null,
      };
    }
    session.pendingDirectHandoff = false;
  },

  // ── Heurísticas de tiempo ──────────────────────────────────────────────────

  isPaused(session) {
    return PAUSED_MODES.has(session.activationMode);
  },

  // ¿Pasó suficiente tiempo desde pausedAt para mandar mensaje de reconexión?
  shouldReawaken(session) {
    if (!this.isPaused(session)) return false;
    if (!session.pausedAt) return false;
    return (Date.now() - session.pausedAt) >= config.timings.reawakenAfterMs;
  },

  // ¿La sesión armada expiró la ventana de seguridad?
  isArmedWindowExpired(session) {
    if (session.activationMode !== ACTIVATION_MODE.ARMED_BY_ADVISOR) return false;
    if (!session.armedAt) return true;
    return (Date.now() - session.armedAt) > config.timings.armedWindowMs;
  },

  // ¿El cliente nunca ha escrito a este chat?
  hasClientEverMessaged(session) {
    return session.lastClientMessageAt != null;
  },

  // ── Pausa global (admin panel) ─────────────────────────────────────────────

  async setPausedGlobal(paused) {
    const redis = getRedisClient();
    await redis.set(`${PAUSED_PREFIX}global`, paused ? '1' : '0');
  },

  async isGloballyPaused() {
    const redis = getRedisClient();
    const val = await redis.get(`${PAUSED_PREFIX}global`);
    return val === '1';
  },

  // ── Listar sesiones activas (para panel admin) ────────────────────────────

  async listActive() {
    const redis = getRedisClient();
    const keys = await redis.keys(`${PREFIX}*`);
    const sessions = [];
    for (const key of keys) {
      const raw = await redis.get(key);
      if (raw) {
        try {
          sessions.push(migrateLegacySession(JSON.parse(raw)));
        } catch (_) {}
      }
    }
    return sessions;
  },

  // ── Números excluidos del bot ──────────────────────────────────────────────

  async getExcludedNumbers() {
    const redis = getRedisClient();
    try {
      const raw = await redis.get(EXCLUDED_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      logger.error(`[Session] getExcluded error: ${err.message}`);
      return [];
    }
  },

  async addExcludedNumber(number) {
    const list = await this.getExcludedNumbers();
    const clean = String(number).replace(/\D/g, '');
    if (!clean || list.includes(clean)) return list;
    list.push(clean);
    const redis = getRedisClient();
    await redis.set(EXCLUDED_KEY, JSON.stringify(list));
    logger.info(`[Session] Número excluido: ${clean}`);
    return list;
  },

  async removeExcludedNumber(number) {
    const list = await this.getExcludedNumbers();
    const clean = String(number).replace(/\D/g, '');
    const updated = list.filter(n => n !== clean);
    const redis = getRedisClient();
    await redis.set(EXCLUDED_KEY, JSON.stringify(updated));
    logger.info(`[Session] Número removido de excluidos: ${clean}`);
    return updated;
  },

  async isExcluded(userId) {
    const list = await this.getExcludedNumbers();
    const phone = String(userId).replace(/@.*$/, '').replace(/:.*$/, '');
    return list.some(n =>
      n === userId || n === phone || phone.includes(n) || n.includes(phone)
    );
  },
};
