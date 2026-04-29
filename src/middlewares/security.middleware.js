import crypto from 'crypto';
import { logger } from '../config/logger.js';

/**
 * Verifica la firma X-Hub-Signature-256 que Meta incluye en cada request POST.
 * Si no coincide, rechaza el request con 401.
 * Solo activa si APP_SECRET está definido en el entorno.
 */
export function verifyMetaSignature(req, res, next) {
  const appSecret = process.env.META_APP_SECRET;

  // Si no hay app secret configurado, saltar validación (modo dev sin secret)
  if (!appSecret) {
    return next();
  }

  const signature = req.headers['x-hub-signature-256'];

  if (!signature) {
    logger.warn('[Security] Request sin firma X-Hub-Signature-256');
    return res.sendStatus(401);
  }

  const rawBody = JSON.stringify(req.body);
  const expected = `sha256=${crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex')}`;

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    logger.warn('[Security] Firma inválida — posible request no autorizado');
    return res.sendStatus(401);
  }

  next();
}
