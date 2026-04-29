import { getRedisClient } from '../config/redis.js';
import { logger } from '../config/logger.js';

const PREFIX = 'kia:session:';
const PAUSED_PREFIX = 'kia:paused:';  // pausas globales por admin
const TTL = 60 * 60 * 6;

function defaultSession(userId) {
  return {
    userId,
    step: 'WELCOME',
    lead: {
      name: null,
      phone: null,
      interest: null,
      budget: null,
      employment: null,
      income: null,
      creditStatus: null,
    },
    handoffMode: false,   // bot pausado por flujo completo
    bryantook: false,     // bryan tomó la conversación manualmente
    updatedAt: Date.now(),
  };
}

export const SessionService = {
  async get(userId) {
    const redis = getRedisClient();
    try {
      const raw = await redis.get(`${PREFIX}${userId}`);
      if (!raw) return defaultSession(userId);
      return JSON.parse(raw);
    } catch (err) {
      logger.error(`[Session] get error: ${err.message}`);
      return defaultSession(userId);
    }
  },

  async save(session) {
    const redis = getRedisClient();
    try {
      session.updatedAt = Date.now();
      await redis.setex(`${PREFIX}${session.userId}`, TTL, JSON.stringify(session));
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

  // Bryan tomó la conversación — pausar bot para este cliente
  async bryantook(userId) {
    const session = await this.get(userId);
    session.bryantook = true;
    await this.save(session);
    logger.info(`[Session] Bryan tomó conversación: ${userId}`);
  },

  // Pausar bot globalmente (desde admin panel)
  async setPausedGlobal(paused) {
    const redis = getRedisClient();
    await redis.set(`${PAUSED_PREFIX}global`, paused ? '1' : '0');
  },

  async isGloballyPaused() {
    const redis = getRedisClient();
    const val = await redis.get(`${PAUSED_PREFIX}global`);
    return val === '1';
  },

  // Listar sesiones activas
  async listActive() {
    const redis = getRedisClient();
    const keys = await redis.keys(`${PREFIX}*`);
    const sessions = [];
    for (const key of keys) {
      const raw = await redis.get(key);
      if (raw) {
        try { sessions.push(JSON.parse(raw)); } catch (_) {}
      }
    }
    return sessions;
  },

  // ── Números excluidos del bot ─────────────────────────────────────────────
  async getExcludedNumbers() {
    const redis = getRedisClient();
    try {
      const raw = await redis.get('kia:excluded');
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      logger.error(`[Session] getExcluded error: ${err.message}`);
      return [];
    }
  },

  async addExcludedNumber(number) {
    const list = await this.getExcludedNumbers();
    const clean = number.replace(/\D/g, '');
    if (!clean || list.includes(clean)) return list;
    list.push(clean);
    const redis = getRedisClient();
    await redis.set('kia:excluded', JSON.stringify(list));
    logger.info(`[Session] Número excluido: ${clean}`);
    return list;
  },

  async removeExcludedNumber(number) {
    const list = await this.getExcludedNumbers();
    const clean = number.replace(/\D/g, '');
    const updated = list.filter(n => n !== clean);
    const redis = getRedisClient();
    await redis.set('kia:excluded', JSON.stringify(updated));
    logger.info(`[Session] Número removido de excluidos: ${clean}`);
    return updated;
  },

  async isExcluded(userId) {
    const list = await this.getExcludedNumbers();
    // Comparar contra el userId completo (para LIDs) y contra el número limpio
    const phone = userId.replace(/@.*$/, '');
    return list.some(n => n === userId || n === phone || phone.includes(n) || n.includes(phone));
  },
};