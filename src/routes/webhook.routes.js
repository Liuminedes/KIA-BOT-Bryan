import { Router } from 'express';
import { verifyWebhook, receiveWebhook } from '../controllers/webhook.controller.js';
import { verifyMetaSignature } from '../middlewares/security.middleware.js';

const router = Router();

// GET no lleva firma HMAC — solo verificación de token
router.get('/', verifyWebhook);

// POST sí lleva firma HMAC de Meta
router.post('/', verifyMetaSignature, receiveWebhook);

export default router;