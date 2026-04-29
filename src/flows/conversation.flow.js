import { WhatsAppService } from '../services/whatsapp.service.js';
import { SessionService } from '../services/session.service.js';
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';
import {
  STEPS,
  RESET_KEYWORDS,
  HANDOFF_KEYWORDS,
  KIA_VEHICLES_FLAT,
  VEHICLE_TYPE_MAP,
  VEHICLE_INDEX_BY_TYPE,
  BUDGET_MAP,
  EMPLOYMENT_MAP,
} from './steps.js';
import { MSG } from './messages.js';

const CREDIT_MAP = { '1': 'clean', '2': 'reported', '3': 'unknown' };

// ─────────────────────────────────────────────────────────────────────────────
// ENTRADA PRINCIPAL — mensaje del cliente
// ─────────────────────────────────────────────────────────────────────────────
export async function handleMessage({ userId, text, pushName }) {
  await WhatsAppService.markAsRead();

  // Pausa global desde admin
  const globallyPaused = await SessionService.isGloballyPaused();
  if (globallyPaused) return;

  const advisorJid = config.advisor.phone ? `${config.advisor.phone}@c.us` : null;

  // Ignorar mensajes del propio asesor
  if (advisorJid && userId === advisorJid) {
    logger.debug(`[Flow] Mensaje del asesor ignorado`);
    return;
  }

  // Ignorar números excluidos
  const excluded = await SessionService.isExcluded(userId);
  if (excluded) {
    logger.debug(`[Flow] Número excluido: ${userId}`);
    return;
  }

  const session  = await SessionService.get(userId);
  const input    = (text || '').trim().toLowerCase();
  const inputNum = input.replace(/[^\d]/g, '');

  // Guardar pushName para el admin panel
  if (pushName && !session.pushName) {
    session.pushName = pushName;
  }

  // ── Bryan tomó la conversación — bot pausado ────────────────────────────────
  if (session.bryantook) {
    if (RESET_KEYWORDS.includes(input)) {
      session.bryantook = false;
      session.handoffMode = false;
      session.step = STEPS.WELCOME;
      session.lead = { name: null, phone: null, interest: null, budget: null, employment: null, income: null, creditStatus: null };
      await SessionService.save(session);
      await WhatsAppService.sendText(userId, MSG.askNameFirst());
      return;
    }
    // Bot completamente silencioso mientras Bryan atiende
    return;
  }

  // ── Modo handoff completado — bot silencioso ───────────────────────────────
  if (session.handoffMode) {
    // Bot completamente silencioso después del handoff
    return;
  }

  // ── Keywords globales de reset ──────────────────────────────────────────────
  if (RESET_KEYWORDS.includes(input)) {
    session.step = STEPS.WELCOME;
    session.lead = { name: null, phone: null, interest: null, budget: null, employment: null, income: null, creditStatus: null };
    await SessionService.save(session);
    return WhatsAppService.sendText(userId, MSG.askNameFirst());
  }

  // ── Keywords de handoff directo (solo después del menú) ─────────────────────
  if (
    session.step !== STEPS.WELCOME &&
    HANDOFF_KEYWORDS.some(kw => input.includes(kw))
  ) {
    return triggerHandoffDirect(userId, session);
  }

  logger.debug(`[Flow] ${userId} step=${session.step} input="${input.substring(0, 40)}"`);

  switch (session.step) {
    case STEPS.WELCOME:            return handleWelcome(userId, session, text, pushName);
    case STEPS.MENU:               return handleMenu(userId, session, inputNum, input);
    case STEPS.CATALOG_TYPE:       return handleCatalogType(userId, session, inputNum, input);
    case STEPS.INFO_VEHICLES:      return handleVehicleSelection(userId, session, inputNum, text);
    case STEPS.VEHICLE_DETAIL:     return handleVehicleDetailAction(userId, session, inputNum);
    case STEPS.CAPTURE_INTEREST:   return handleCaptureInterest(userId, session, inputNum, text, input);
    case STEPS.CAPTURE_BUDGET:     return handleCaptureBudget(userId, session, inputNum);
    case STEPS.CAPTURE_EMPLOYMENT: return handleCaptureEmployment(userId, session, inputNum);
    case STEPS.CAPTURE_INCOME:     return handleCaptureIncome(userId, session, text);
    case STEPS.CREDIT_CHECK:       return handleCreditCheck(userId, session, inputNum, input);
    case STEPS.ASK_LEAD_NAME:      return handleAskLeadName(userId, session, text);
    case STEPS.ASK_LEAD_PHONE:     return handleAskLeadPhone(userId, session, text);
    default:                       return handleWelcome(userId, session, text, pushName);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MENSAJE DE BRYAN (saliente) — pausa el bot para ese cliente
// ─────────────────────────────────────────────────────────────────────────────
export async function handleBryanMessage({ clientUserId }) {
  const session = await SessionService.get(clientUserId);

  // Si el bot ya está en handoff o bryan ya tomó — no hacer nada
  if (session.bryantook || session.handoffMode) return;

  // Bryan escribió primero o interrumpió — pausar bot
  session.bryantook = true;
  await SessionService.save(session);
  logger.info(`[Flow] Bryan tomó conversación con ${clientUserId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

async function handleWelcome(userId, session, text, pushName) {
  session.step = STEPS.MENU;
  if (pushName) session.pushName = pushName;
  await SessionService.save(session);
  await WhatsAppService.sendText(userId, MSG.bryanIntroduced());
  await delay(600);
  return WhatsAppService.sendText(userId, MSG.menu());
}

async function handleMenu(userId, session, inputNum, input) {
  if (inputNum === '1' || input.includes('catalog') || input.includes('vehiculo') || input.includes('vehículo')) {
    session.step = STEPS.CATALOG_TYPE;
    await SessionService.save(session);
    return WhatsAppService.sendText(userId, MSG.catalogType());
  }
  if (inputNum === '2' || input.includes('cotiz')) {
    session.step = STEPS.CAPTURE_INTEREST;
    await SessionService.save(session);
    return WhatsAppService.sendText(userId, MSG.askInterest(session.lead.name || 'amigo'));
  }
  if (inputNum === '3') {
    return triggerHandoffDirect(userId, session);
  }
  return WhatsAppService.sendText(userId, MSG.menu());
}

async function handleCatalogType(userId, session, inputNum, input) {
  let tipo = VEHICLE_TYPE_MAP[inputNum] || null;
  if (!tipo) {
    if (input.includes('gasolina'))                               tipo = 'gasolina';
    else if (input.includes('hibrid') || input.includes('hev'))  tipo = 'hibrido';
    else if (input.includes('electr') || input.includes('eléc')) tipo = 'electrico';
    else if (input.includes('todos') || input.includes('todo'))  tipo = 'todos';
    else return WhatsAppService.sendText(userId, MSG.catalogType());
  }
  session.catalogType = tipo;
  session.step = STEPS.INFO_VEHICLES;
  await SessionService.save(session);
  return WhatsAppService.sendText(userId, MSG.vehiclesList(session.lead.name || '', tipo));
}

async function handleVehicleSelection(userId, session, inputNum, text) {
  const tipo     = session.catalogType || 'todos';
  const index    = VEHICLE_INDEX_BY_TYPE[tipo] || VEHICLE_INDEX_BY_TYPE['todos'];
  const selected = KIA_VEHICLES_FLAT.find(v => v.id === (index[inputNum] || null));

  if (selected) {
    session.lead.interest = selected.title;
    session.step = STEPS.VEHICLE_DETAIL;
    await SessionService.save(session);
    await WhatsAppService.sendText(userId, MSG.vehicleDetail(selected));
    await delay(500);
    await WhatsAppService.sendText(userId, MSG.portfolioLink());
    await delay(400);
    return WhatsAppService.sendText(userId, MSG.vehicleDetailOptions());
  }

  if (text && text.trim().length > 2 && !/^\d+$/.test(text.trim())) {
    session.lead.interest = text.trim();
    session.step = STEPS.CAPTURE_BUDGET;
    await SessionService.save(session);
    return WhatsAppService.sendText(userId, MSG.askBudget());
  }

  return WhatsAppService.sendText(userId, MSG.vehiclesList(session.lead.name || '', session.catalogType || 'todos'));
}

async function handleVehicleDetailAction(userId, session, inputNum) {
  if (inputNum === '1') {
    session.step = STEPS.CAPTURE_BUDGET;
    await SessionService.save(session);
    return WhatsAppService.sendText(userId, MSG.askBudget());
  }
  session.step = STEPS.INFO_VEHICLES;
  await SessionService.save(session);
  return WhatsAppService.sendText(userId, MSG.vehiclesList(session.lead.name || '', session.catalogType || 'todos'));
}

async function handleCaptureInterest(userId, session, inputNum, text, input) {
  const allIndex = VEHICLE_INDEX_BY_TYPE['todos'];
  const selected = KIA_VEHICLES_FLAT.find(v => v.id === (allIndex[inputNum] || null));

  if (selected) {
    session.lead.interest = selected.title;
    session.step = STEPS.VEHICLE_DETAIL;
    await SessionService.save(session);
    await WhatsAppService.sendText(userId, MSG.vehicleDetail(selected));
    await delay(500);
    await WhatsAppService.sendText(userId, MSG.portfolioLink());
    await delay(400);
    return WhatsAppService.sendText(userId, MSG.vehicleDetailOptions());
  }

  if (text && text.trim().length > 2 && !/^\d+$/.test(text.trim())) {
    session.lead.interest = text.trim();
    session.step = STEPS.CAPTURE_BUDGET;
    await SessionService.save(session);
    return WhatsAppService.sendText(userId, MSG.askBudget());
  }

  if (input?.includes('catalog') || input?.includes('catálogo')) {
    session.step = STEPS.CATALOG_TYPE;
    await SessionService.save(session);
    return WhatsAppService.sendText(userId, MSG.catalogType());
  }

  return WhatsAppService.sendText(userId, MSG.askInterest(session.lead.name || 'amigo'));
}

async function handleCaptureBudget(userId, session, inputNum) {
  const budget = BUDGET_MAP[inputNum];
  if (!budget) return WhatsAppService.sendText(userId, MSG.askBudget());
  session.lead.budget = budget;
  session.step = STEPS.CAPTURE_EMPLOYMENT;
  await SessionService.save(session);
  return WhatsAppService.sendText(userId, MSG.askEmployment());
}

async function handleCaptureEmployment(userId, session, inputNum) {
  const employment = EMPLOYMENT_MAP[inputNum];
  if (!employment) return WhatsAppService.sendText(userId, MSG.invalidEmployment());
  session.lead.employment = employment;
  session.step = STEPS.CAPTURE_INCOME;
  await SessionService.save(session);
  return WhatsAppService.sendText(userId, MSG.askIncome());
}

async function handleCaptureIncome(userId, session, text) {
  const income = text?.trim();
  if (!income || income.length < 3) return WhatsAppService.sendText(userId, MSG.invalidIncome());
  session.lead.income = income;
  session.step = STEPS.CREDIT_CHECK;
  await SessionService.save(session);
  return WhatsAppService.sendText(userId, MSG.askCreditCheck());
}

async function handleCreditCheck(userId, session, inputNum, input) {
  let status = CREDIT_MAP[inputNum] || null;
  if (!status) {
    if (input.includes('no') || input.includes('limpio') || input.includes('bien'))     status = 'clean';
    else if (input.includes('sí') || input.includes('si') || input.includes('report'))  status = 'reported';
    else if (input.includes('sé') || input.includes('se') || input.includes('no s'))    status = 'unknown';
    else return WhatsAppService.sendText(userId, MSG.askCreditCheck());
  }
  session.lead.creditStatus = status;

  const responseMsg =
    status === 'clean'    ? MSG.creditResponseClean() :
    status === 'reported' ? MSG.creditResponseReported() :
    MSG.creditResponseUnknown();

  await WhatsAppService.sendText(userId, responseMsg);
  await delay(700);

  // Pedir nombre y teléfono antes del cierre
  session.step = STEPS.ASK_LEAD_NAME;
  await SessionService.save(session);
  return WhatsAppService.sendText(userId, MSG.askLeadName());
}

async function handleAskLeadName(userId, session, text) {
  const name = text?.trim();
  if (!name || name.length < 3 || /^\d+$/.test(name)) {
    return WhatsAppService.sendText(userId, MSG.invalidLeadName());
  }
  session.lead.name = name.toLowerCase().replace(/(^|\s)\S/g, l => l.toUpperCase());
  session.step = STEPS.ASK_LEAD_PHONE;
  await SessionService.save(session);
  return WhatsAppService.sendText(userId, MSG.askLeadPhone(session.lead.name));
}

async function handleAskLeadPhone(userId, session, text) {
  const phone = text.replace(/\D/g, '');
  if (phone.length < 7) {
    return WhatsAppService.sendText(userId, MSG.invalidLeadPhone());
  }
  session.lead.phone = phone.startsWith('57') ? phone : `57${phone}`;

  // Si venía de handoff directo → completar handoff directo
  if (session.pendingDirectHandoff) {
    session.pendingDirectHandoff = false;
    return triggerHandoffDirect(userId, session);
  }

  await triggerHandoff(userId, session);
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDOFF COMPLETO
// ─────────────────────────────────────────────────────────────────────────────
async function triggerHandoff(userId, session) {
  session.handoffMode = true;
  session.step = STEPS.HANDOFF;
  await SessionService.save(session);

  const advisorJid = config.advisor.phone ? `${config.advisor.phone}@c.us` : null;

  await WhatsAppService.sendText(userId, MSG.qualified(session.lead));
  await delay(800);
  await WhatsAppService.sendText(userId, MSG.handoff(session.lead.name));

  if (advisorJid) {
    await WhatsAppService.sendText(advisorJid, MSG.handoffAdvisor(session.lead))
      .catch(err => logger.error(`[Flow] Error notificando asesor: ${err.message}`));
  }

  logger.info(`[Flow] ✅ Handoff completo para ${userId}`, { lead: session.lead });
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDOFF DIRECTO (pide nombre y teléfono antes de notificar)
// ─────────────────────────────────────────────────────────────────────────────
async function triggerHandoffDirect(userId, session) {
  // Si ya tiene nombre y teléfono — notificar directo
  if (session.lead.name && session.lead.phone) {
    session.handoffMode = true;
    session.step = STEPS.HANDOFF;
    await SessionService.save(session);

    const advisorJid = config.advisor.phone ? `${config.advisor.phone}@c.us` : null;
    await WhatsAppService.sendText(userId, MSG.handoffDirect());

    if (advisorJid) {
      await WhatsAppService.sendText(advisorJid, MSG.handoffAdvisorDirect(session.lead))
        .catch(err => logger.error(`[Flow] Error notificando asesor directo: ${err.message}`));
    }
    return;
  }

  // Si no tiene nombre/teléfono — pedirlos primero
  await WhatsAppService.sendText(userId, MSG.handoffDirect());
  await delay(600);
  session.step = STEPS.ASK_LEAD_NAME;
  // Marcar que después del lead info va handoff directo
  session.pendingDirectHandoff = true;
  await SessionService.save(session);
  return WhatsAppService.sendText(userId, MSG.askLeadName());
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}