import Redis from 'ioredis';
import { logger } from './logger.js';

let client = null;

export function getRedisClient() {
  if (!client) {
    client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000)),
    });
    client.on('connect', () => logger.info('[Redis] Conectado'));
    client.on('error', (err) => logger.error(`[Redis] Error: ${err.message}`));
  }
  return client;
}
