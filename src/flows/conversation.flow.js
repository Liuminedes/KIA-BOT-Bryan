import { WhatsAppService } from '../services/whatsapp.service.js';
import { SessionService } from '../services/session.service.js';
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';
import {
  STEPS,
  ACTIVATION_MODE,
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

// ═════════════════════════════════════════════════════════════════════════════
// ENTRADA PRINCIPAL — MENSAJE DEL CLIENTE
// ═════════════════════════════════════════════════════════════════════════════
export async function handleMessage({ userId, text, pushName }) {
  // ── 1. Pausa global admin ──────────────────────────────────────────────────
  if (await SessionService.isGloballyPaused()) return;

  // ── 2. Número excluido ─────────────────────────────────────────────────────
  if (await SessionService.isExcluded(userId)) {
    logger.debug(`[Flow] Número excluido: ${userId}`);
    return;
  }

  const session  = await SessionService.get(userId);
  const input    = (text || '').trim().toLowerCase();
  const inputNum = input.replace(/[^\d]/g, '');

  // Marcar que el cliente escribió (para distinguir cliente nuevo vs recurrente)
  SessionService.markClientMessage(session);

  // Guardar pushName la primera vez
  if (pushName && !session.pushName) session.pushName = pushName;

  // ── 2.5. MODO ASESOR-ONLY (opcional, activado por ADVISOR_ONLY_MODE=true) ──
  //
  // En este modo, el bot SÓLO interactúa en conversaciones donde el asesor
  // haya escrito primero (ARMED_BY_ADVISOR). Si el cliente escribe sin que
  // el asesor lo haya iniciado, el bot queda silencioso y el asesor atiende
  // manualmente.
  //
  // Se permite el paso si:
  //   - La sesión está en ARMED_BY_ADVISOR (asesor ya inició → bot responde)
  //   - La sesión ya está en flujo ACTIVE o REAWAKEN_CHOICE (conversación
  //     ya arrancada previamente, no queremos dejar al cliente colgado)
  //   - La sesión está pausada (otros checks de abajo manejan reawaken, etc.)
  //
  // Se BLOQUEA si:
  //   - activationMode === ACTIVE y step === WELCOME (= cliente nuevo que
  //     escribe sin que el asesor haya iniciado nada)
  if (config.advisor.onlyMode) {
    const isFirstContactByClient =
      session.activationMode === ACTIVATION_MODE.ACTIVE &&
      session.step === STEPS.WELCOME &&
      !session.firstContactBy;

    if (isFirstContactByClient) {
      // Marcar el contacto pero NO responder. Guardar para que el panel admin
      // pueda ver que este cliente escribió (útil para auditoría), pero el
      // asesor lo atiende manualmente.
      session.firstContactBy = 'CLIENT';
      await SessionService.save(session);
      logger.info(`[Flow] 🔒 onlyMode: cliente ${userId} escribió primero — bot silencioso`);
      return;
    }

    // Si firstContactBy ya es 'CLIENT' y sigue en ACTIVE/WELCOME, significa
    // que el cliente ya escribió antes y el bot lo ignoró. Seguir ignorando.
    if (
      session.firstContactBy === 'CLIENT' &&
      session.activationMode === ACTIVATION_MODE.ACTIVE &&
      session.step === STEPS.WELCOME
    ) {
      await SessionService.save(session);
      logger.debug(`[Flow] 🔒 onlyMode: cliente ${userId} insiste — bot sigue silencioso`);
      return;
    }
  }

  // ── 3. Estado ARMED_BY_ADVISOR: el asesor escribió primero, ahora responde
  //      el cliente. Hay que "despertar" el bot con el menú de transición.
  if (session.activationMode === ACTIVATION_MODE.ARMED_BY_ADVISOR) {
    // Si pasó mucho tiempo desde el armado, tratar como cliente nuevo
    if (SessionService.isArmedWindowExpired(session)) {
      logger.info(`[Flow] Ventana armada expiró para ${userId} — tratando como nuevo`);
      SessionService.markActive(session, true);
      await SessionService.save(session);
      return handleWelcome(userId, session, text, pushName);
    }

    logger.info(`[Flow] 🎯 Cliente responde tras armado por asesor: ${userId}`);
    session.activationMode = ACTIVATION_MODE.ACTIVE;
    session.step           = STEPS.MENU;
    session.armedAt        = null;
    await SessionService.save(session);
    return WhatsAppService.sendText(userId, MSG.armedHandoff());
  }

  // ── 4. Estados pausados (ADVISOR, HANDOFF, ADMIN) ─────────────────────────
  if (SessionService.isPaused(session)) {

    // ── 4a. Reset manual explícito ("menu") siempre disponible ──────────────
    if (RESET_KEYWORDS.includes(input)) {
      SessionService.markActive(session, true);
      await SessionService.save(session);
      return handleWelcome(userId, session, text, pushName);
    }

    // ── 4b. REAWAKEN: pasaron >48h sin respuesta, mandar opciones de reconexión
    //       EXCEPTO en onlyMode: ahí el bot respeta la pausa para siempre.
    if (!config.advisor.onlyMode && SessionService.shouldReawaken(session)) {
      logger.info(`[Flow] ⏰ Reawaken para ${userId} tras ${formatHours(Date.now() - session.pausedAt)}h`);
      session.step = STEPS.REAWAKEN_CHOICE;
      // NO cambiar activationMode todavía — si el cliente ignora, seguimos pausados
      await SessionService.save(session);
      // Usar pushName (nombre del contacto en WhatsApp) en vez de lead.name
      // porque lead.name puede haber sido capturado en un flujo previo con
      // otro nombre diferente al del contacto real.
      return WhatsAppService.sendText(userId, MSG.reawaken(session.pushName || session.lead?.name));
    }

    // ── 4c. Todavía dentro de la ventana de pausa: bot silencioso ──────────
    await SessionService.save(session);
    return;
  }

  // ── 5. Paso especial: el cliente está eligiendo en el menú de reawaken ────
  if (session.step === STEPS.REAWAKEN_CHOICE) {
    return handleReawakenChoice(userId, session, inputNum, input);
  }

  // ── 6. Keywords globales de reset ──────────────────────────────────────────
  if (RESET_KEYWORDS.includes(input)) {
    SessionService.markActive(session, true);
    await SessionService.save(session);
    return handleWelcome(userId, session, text, pushName);
  }

  // ── 7. Keywords de handoff directo (después del menú inicial) ─────────────
  if (
    session.step !== STEPS.WELCOME &&
    HANDOFF_KEYWORDS.some(kw => input.includes(kw))
  ) {
    return triggerHandoffDirect(userId, session);
  }

  logger.debug(`[Flow] ${userId} step=${session.step} mode=${session.activationMode} input="${input.substring(0, 40)}"`);

  // ── 8. Máquina de estados del flujo de calificación ────────────────────────
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

// ═════════════════════════════════════════════════════════════════════════════
// ENTRADA SECUNDARIA — MENSAJE DEL ASESOR (saliente detectado)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * Lógica clave:
 *
 *   - Si el cliente NUNCA ha escrito al chat → asumimos que el asesor está
 *     rompiendo el hielo. El bot queda ARMADO y cuando el cliente responda
 *     aparecerá con un menú de transición.
 *
 *   - Si el cliente YA escribió antes → el asesor está interrumpiendo al bot.
 *     Pausamos el bot (PAUSED_BY_ADVISOR).
 *
 *   - Si el bot YA estaba armado o pausado → no hacemos nada (el asesor sigue
 *     escribiendo mientras espera al cliente, no queremos cambiar el estado
 *     cada vez).
 */
export async function handleAdvisorMessage({ clientUserId }) {
  const existed = await SessionService.exists(clientUserId);
  const session = await SessionService.get(clientUserId);

  // ── Si el bot YA está pausado, refrescar pausedAt para postergar reawaken ─
  // El asesor sigue activo en la conversación, no queremos que el bot mande
  // mensaje de reconexión sólo porque pasaron 48h desde la PRIMERA pausa.
  if (SessionService.isPaused(session)) {
    session.pausedAt = Date.now();
    await SessionService.save(session);
    logger.debug(`[Flow] Asesor escribió a ${clientUserId} (ya pausado) — pausedAt refrescado`);
    return;
  }

  // Si el bot ya está armado, no tocar nada (Gerardo en onlyMode siguió escribiendo)
  if (session.activationMode === ACTIVATION_MODE.ARMED_BY_ADVISOR) {
    logger.debug(`[Flow] Asesor escribió a ${clientUserId} (ya ARMADO), ignorando`);
    return;
  }

  // ── ARMED solo aplica en modo selectivo (Gerardo). Para el resto de asesores
  //    (Bryan, Nataly), CUALQUIER mensaje saliente detectado pausa el bot.
  //    Esto es idéntico al comportamiento del bot original con whatsapp-web.js
  //    y evita el loop de auto-armado por mismatches del Set botSentTexts.
  if (config.advisor.onlyMode) {
    const clientHasMessaged = SessionService.hasClientEverMessaged(session);

    if (!existed || !clientHasMessaged) {
      // ── CASO A: Asesor rompe el hielo (solo en onlyMode) ──────────────────
      SessionService.markArmedByAdvisor(session);
      await SessionService.save(session);
      logger.info(`[Flow] 🎯 Asesor rompió el hielo con ${clientUserId} — bot ARMADO`);
      return;
    }
  }

  // ── CASO POR DEFECTO: Asesor escribió → pausar bot ─────────────────────────
  // Aplica para Bryan/Nataly siempre, y para Gerardo cuando el cliente ya
  // había escrito antes (interrupción, no rompe-hielo).
  SessionService.markPausedByAdvisor(session);
  await SessionService.save(session);
  logger.info(`[Flow] ⏸️  Asesor escribió a ${clientUserId} — bot PAUSADO`);
}

// ═════════════════════════════════════════════════════════════════════════════
// HANDLERS DE PASOS
// ═════════════════════════════════════════════════════════════════════════════

async function handleWelcome(userId, session, _text, pushName) {
  session.step           = STEPS.MENU;
  session.activationMode = ACTIVATION_MODE.ACTIVE;
  if (pushName) session.pushName = pushName;
  await SessionService.save(session);
  await WhatsAppService.sendText(userId, MSG.advisorIntroduced());
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
    if (config.advisor.portfolioUrl) {
      await WhatsAppService.sendText(userId, MSG.portfolioLink());
      await delay(400);
    }
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
    if (config.advisor.portfolioUrl) {
      await WhatsAppService.sendText(userId, MSG.portfolioLink());
      await delay(400);
    }
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

  if (session.pendingDirectHandoff) {
    session.pendingDirectHandoff = false;
    await SessionService.save(session);
    return triggerHandoffDirect(userId, session);
  }

  await triggerHandoff(userId, session);
}

// ═════════════════════════════════════════════════════════════════════════════
// REAWAKEN — CLIENTE ELIGE EN MENÚ DE RECONEXIÓN
// ═════════════════════════════════════════════════════════════════════════════
async function handleReawakenChoice(userId, session, inputNum, input) {
  // Opción 1: seguir esperando al asesor
  if (inputNum === '1' || input.includes('asesor') || input.includes(config.advisor.firstName.toLowerCase())) {
    // Mantener pausa pero refrescar pausedAt para que no vuelva a dispararse
    // inmediatamente si el cliente sigue escribiendo
    session.pausedAt = Date.now();
    session.step = STEPS.HANDOFF;  // step irrelevante pero consistente
    // activationMode se mantiene en el estado pausado anterior
    await SessionService.save(session);

    // Notificar al asesor que este cliente volvió a escribir
    const advisorJid = config.advisor.phone ? `${config.advisor.phone}@s.whatsapp.net` : null;
    if (advisorJid) {
      const name = session.lead?.name || session.pushName || 'Cliente';
      const phoneDisplay = userId.replace(/@.*$/, '').replace(/:.*$/, '');
      await WhatsAppService.sendText(
        advisorJid,
        `🔔 *Cliente retoma contacto*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `👤 *${name}* | 📱 +${phoneDisplay}\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `_El cliente escribió tras pausa y quiere seguir contigo._`
      ).catch(err => logger.error(`[Flow] Error notificando reawaken: ${err.message}`));
    }

    return WhatsAppService.sendText(userId, MSG.reawakenWaitAdvisor());
  }

  // Opción 2: volver al menú del bot
  if (inputNum === '2' || input.includes('catalog') || input.includes('cotiz')) {
    SessionService.markActive(session, true);
    // Conservar el nombre si ya lo teníamos
    await SessionService.save(session);
    return handleWelcome(userId, session, null, session.pushName);
  }

  // Respuesta no válida — repetir
  return WhatsAppService.sendText(userId, MSG.reawaken(session.lead?.name || session.pushName));
}

// ═════════════════════════════════════════════════════════════════════════════
// HANDOFF COMPLETO (flujo calificado)
// ═════════════════════════════════════════════════════════════════════════════
async function triggerHandoff(userId, session) {
  SessionService.markHandoffCompleted(session);
  await SessionService.save(session);

  const advisorJid = config.advisor.phone ? `${config.advisor.phone}@s.whatsapp.net` : null;

  await WhatsAppService.sendText(userId, MSG.qualified(session.lead));
  await delay(800);
  await WhatsAppService.sendText(userId, MSG.handoff(session.lead.name));

  if (advisorJid) {
    await WhatsAppService.sendText(advisorJid, MSG.handoffAdvisor(session.lead))
      .catch(err => logger.error(`[Flow] Error notificando asesor: ${err.message}`));
  }

  logger.info(`[Flow] ✅ Handoff completo para ${userId}`, { lead: session.lead });
}

// ═════════════════════════════════════════════════════════════════════════════
// HANDOFF DIRECTO (opción 3 o keywords — pide datos mínimos antes de entregar)
// ═════════════════════════════════════════════════════════════════════════════
async function triggerHandoffDirect(userId, session) {
  // Si ya tiene nombre y teléfono — notificar directo
  if (session.lead.name && session.lead.phone) {
    SessionService.markHandoffCompleted(session);
    await SessionService.save(session);

    const advisorJid = config.advisor.phone ? `${config.advisor.phone}@s.whatsapp.net` : null;
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
  session.pendingDirectHandoff = true;
  await SessionService.save(session);
  return WhatsAppService.sendText(userId, MSG.askLeadName());
}

// ═════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════════
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatHours(ms) {
  return Math.floor(ms / (1000 * 60 * 60));
}