import { config } from '../config/env.js';

const ADVISOR      = config.advisor.name;
const ADVISOR_F    = config.advisor.firstName;
const ADVISOR_URL  = config.advisor.portfolioUrl;
const ADVISOR_SCH  = config.advisor.schedule;
const ADVISOR_SEG  = config.advisor.segment;

const firstName = (name) => name?.split(' ')[0] || name || '';

const formatPhone = (phone) => {
  if (!phone) return 'No disponible';
  const p = phone.replace(/\D/g, '');
  if (p.startsWith('57') && p.length === 12) {
    return `+57 ${p.slice(2,5)} ${p.slice(5,8)} ${p.slice(8)}`;
  }
  return `+${p}`;
};

export const MSG = {

  // ── Bienvenida estándar (cliente escribe primero) ───────────────────────────
  advisorIntroduced: () =>
    `👋 ¡Hola! Soy el asistente de *${ADVISOR}*.\n\n` +
    `Puedo ayudarte con información de vehículos, precios y más.\n\n` +
    `Selecciona una opción con el número correspondiente 👇`,

  menu: () =>
    `¿En qué te puedo ayudar hoy?\n\n` +
    `*1️⃣* Ver catálogo de vehículos\n` +
    `*2️⃣* Solicitar una cotización\n` +
    `*3️⃣* Hablar directamente con ${ADVISOR_F}`,

  // ── Cliente responde al saludo inicial del asesor (ARMED_BY_ADVISOR) ────────
  armedHandoff: () =>
    `👋 ¡Hola! Soy el asistente virtual de *${ADVISOR}*.\n\n` +
    `Mientras ${ADVISOR_F} se conecta contigo, puedo irte ayudando con información ` +
    `para que aproveches mejor su atención personal 😊\n\n` +
    `¿Qué prefieres?\n\n` +
    `*1️⃣* Ver catálogo de vehículos 🚗\n` +
    `*2️⃣* Solicitar una cotización 💰\n` +
    `*3️⃣* Seguir esperando a ${ADVISOR_F} ⏳`,

  // ── Mensaje de reconexión tras pausa larga (REAWAKEN) ───────────────────────
  reawaken: (name) => {
    const saludo = name ? `¡Hola de nuevo, *${firstName(name)}*! 👋` : '¡Hola de nuevo! 👋';
    return (
      `${saludo}\n\n` +
      `Veo que ha pasado un tiempo desde nuestra última conversación.\n\n` +
      `¿Cómo te puedo ayudar ahora?\n\n` +
      `*1️⃣* Seguir hablando con *${ADVISOR_F}* 👤\n` +
      `*2️⃣* Ver el catálogo y cotizar 🚗`
    );
  },

  // ── Catálogo ────────────────────────────────────────────────────────────────
  catalogType: () =>
    `¡Perfecto! Contamos con *17 modelos* disponibles en la línea KIA 2026 🏆\n\n` +
    `¿Qué tipo de vehículo te llama la atención?\n\n` +
    `*1️⃣* 🛢️ Gasolina — 9 modelos desde $59.9M\n` +
    `*2️⃣* 🌿 Híbrido — 5 modelos desde $92.9M\n` +
    `*3️⃣* ⚡ Eléctrico — 4 modelos desde $120.9M\n` +
    `*4️⃣* 🚗 Ver todos los modelos\n\n` +
    `_Todos con garantía de *7 años o 150.000 km* 🛡️_`,

  vehiclesList: (_name, tipo) => {
    const enc = {
      gasolina:  `Línea *Gasolina 2026* 🛢️`,
      hibrido:   `Línea *Híbrida 2026* 🌿`,
      electrico: `Línea *Eléctrica 2026* ⚡`,
      todos:     `*Catálogo completo 2026* 🚗`,
    };
    const listas = {
      gasolina:
        `*1️⃣* New Picanto — desde $59.9M\n*2️⃣* K3 Sedán — desde $81.9M\n` +
        `*3️⃣* K3 Cross — desde $82.9M\n*4️⃣* Soluto — desde $67.9M\n` +
        `*5️⃣* Sonet — desde $90.9M\n*6️⃣* Seltos — desde $111.9M\n` +
        `*7️⃣* Sportage — desde $130.9M\n*8️⃣* K4 — desde $138.9M\n` +
        `*9️⃣* Tasman 🛻 — desde $191.9M`,
      hibrido:
        `*1️⃣* Stonic HEV — desde $92.9M\n*2️⃣* Niro HEV — desde $122.9M\n` +
        `*3️⃣* Sportage HEV — desde $156.9M\n*4️⃣* Sorento HEV — desde $231.9M\n` +
        `*5️⃣* Carnival HEV — desde $271.9M`,
      electrico:
        `*1️⃣* EV3 — desde $120.9M\n*2️⃣* EV5 — desde $155.9M\n` +
        `*3️⃣* EV6 — desde $252.9M\n*4️⃣* EV9 — desde $360.9M`,
      todos:
        `🛢️ *Gasolina:*\n*1* Picanto $59.9M · *2* K3 Sedán $81.9M\n` +
        `*3* K3 Cross $82.9M · *4* Soluto $67.9M\n*5* Sonet $90.9M · *6* Seltos $111.9M\n` +
        `*7* Sportage $130.9M · *8* K4 $138.9M · *9* Tasman 🛻 $191.9M\n\n` +
        `🌿 *Híbrido:*\n*10* Stonic $92.9M · *11* Niro $122.9M\n` +
        `*12* Sportage HEV $156.9M · *13* Sorento $231.9M · *14* Carnival $271.9M\n\n` +
        `⚡ *Eléctrico:*\n*15* EV3 $120.9M · *16* EV5 $155.9M\n` +
        `*17* EV6 $252.9M · *18* EV9 $360.9M`,
    };
    return `${enc[tipo] || enc['todos']}\n\n${listas[tipo] || listas['todos']}\n\n_Responde con el número del modelo 👇_`;
  },

  vehicleDetail: (vehicle) =>
    `¡Excelente elección! ${vehicle.emoji}\n\n${vehicle.ficha}`,

  portfolioLink: () =>
    ADVISOR_URL
      ? `🌐 Más fotos y detalles en el catálogo digital de ${ADVISOR_F}:\n*${ADVISOR_URL}*`
      : `🌐 ${ADVISOR_F} te enviará más detalles en breve.`,

  vehicleDetailOptions: () =>
    `¿Qué te parece? 😊\n\n*1️⃣* Quiero cotizar este vehículo 💰\n*2️⃣* Ver otros modelos 🔙`,

  askInterest: (name) =>
    `¿Ya tienes algún modelo en mente, *${firstName(name)}*? 🤔\n` +
    `Escríbelo o responde *"catalogo"* para explorar 🔍`,

  // ── Cotización ──────────────────────────────────────────────────────────────
  askBudget: () =>
    `Para orientarte mejor, ¿en qué rango de inversión estás pensando? 💵\n\n` +
    `*1️⃣* Hasta $70M\n*2️⃣* $70M – $100M\n*3️⃣* $100M – $140M\n` +
    `*4️⃣* $140M – $180M\n*5️⃣* Más de $180M\n\n` +
    `_Tenemos excelentes planes de financiación 😉_`,

  askEmployment: () =>
    `Una pregunta para ayudarte mejor con la financiación 🤝\n\n` +
    `¿Cuál es tu actividad laboral?\n\n` +
    `*1️⃣* Empleado\n*2️⃣* Independiente\n*3️⃣* Pensionado`,

  invalidEmployment: () =>
    `Responde con *1*, *2* o *3* según tu situación 👇`,

  askIncome: () =>
    `¿Y cuánto son tus ingresos mensuales aproximadamente? 💵\n` +
    `_(Escribe el valor, ej: $2.500.000)_`,

  invalidIncome: () =>
    `Por favor escribe el valor de tus ingresos, ej: *$2.500.000* 💵`,

  askCreditCheck: () =>
    `Una última pregunta antes de preparar tu cotización 😊\n\n` +
    `¿Tienes conocimiento de cómo estás en centrales de riesgo? _(Datacrédito / TransUnion)_\n\n` +
    `*1️⃣* ✅ Sin reportes\n*2️⃣* ⚠️ Con reportes\n*3️⃣* 🤷 No lo sé`,

  // ── Captura Lead (nombre + teléfono al final) ───────────────────────────────
  askLeadName: () =>
    `¡Ya casi terminamos! 🎉\n\n` +
    `Para que ${ADVISOR_F} pueda contactarte personalmente,\n` +
    `¿cuál es tu nombre completo? 😊`,

  invalidLeadName: () =>
    `Por favor escribe tu nombre completo, ej: *Juan Pérez* 😊`,

  askLeadPhone: (name) =>
    `Perfecto, *${firstName(name)}* 😊\n\n` +
    `¿A qué número de WhatsApp podemos contactarte?\n` +
    `_(Ej: 3001234567)_ 📱`,

  invalidLeadPhone: () =>
    `Por favor escribe un número válido, ej: *3001234567* 📱`,

  // ── Cierre ──────────────────────────────────────────────────────────────────
  creditResponseClean:    () => `¡Genial, eso facilita mucho el proceso! 🎉`,
  creditResponseReported: () => `No hay problema, tenemos opciones para diferentes situaciones 🙌`,
  creditResponseUnknown:  () => `Tranquilo, eso lo verificamos fácilmente en el proceso 👍`,

  qualified: (lead) =>
    `📋 *Resumen de tu asesoría:*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `👤 ${lead.name || 'Sin nombre'} | 📱 ${formatPhone(lead.phone)}\n` +
    `🚗 ${lead.interest || 'Por definir'}\n` +
    `💰 ${lead.budget || 'Por definir'}\n` +
    `💼 ${lead.employment || 'No indicado'} | 💵 ${lead.income || 'No indicado'}\n` +
    `📊 Centrales: ${
      lead.creditStatus === 'clean'    ? 'Sin reportes ✅' :
      lead.creditStatus === 'reported' ? 'Con reportes ⚠️' : 'Por verificar 🔍'
    }\n` +
    `━━━━━━━━━━━━━━━━`,

  handoff: (name) =>
    `¡Listo, *${firstName(name)}*! Ya tengo todo lo que necesito 🏆\n\n` +
    `${ADVISOR_F} está preparando tu cotización personalizada con las mejores opciones de financiación.\n\n` +
    `En breve te contacta. ¡Gracias por confiar en *KIA Almotores*! 🤝🚗`,

  handoffAdvisor: (lead) =>
    `🔔 *NUEVO LEAD — KIA Bot*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `👤 *${lead.name || 'Sin nombre'}* | 📱 ${formatPhone(lead.phone)}\n` +
    `🚗 ${lead.interest || 'No indicado'}\n` +
    `💰 ${lead.budget || 'No indicado'}\n` +
    `💼 ${lead.employment || 'No indicado'} | 💵 ${lead.income || 'No indicado'}\n` +
    `📊 ${
      lead.creditStatus === 'clean'    ? 'Sin reportes ✅' :
      lead.creditStatus === 'reported' ? 'Con reportes ⚠️' : 'No verificado 🔍'
    }\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `_Bot pausado. Cliente listo para contactar._`,

  handoffDirect: () =>
    `¡Claro! En un momento ${ADVISOR_F} estará contigo personalmente 🤝\n\n` +
    `Déjame avisarle que quieres hablar con él.`,

  handoffAdvisorDirect: (lead) =>
    `🔔 *CONTACTO DIRECTO — KIA Bot*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `👤 *${lead.name || 'Cliente nuevo'}* | 📱 ${formatPhone(lead.phone)}\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `_El cliente solicitó hablar contigo directamente._`,

  // ── Cuando el cliente elige seguir esperando al asesor (opción 3 en armed) ─
  waitForAdvisor: () =>
    `¡Perfecto! ${ADVISOR_F} te responderá en cuanto esté disponible 👌\n\n` +
    `🕐 *Horario de atención:* ${ADVISOR_SCH}\n\n` +
    `_Si cambias de opinión, escribe *"menu"* y te ayudo con información._`,

  // ── Cliente eligió seguir con asesor en reawaken ────────────────────────────
  reawakenWaitAdvisor: () =>
    `Listo, le aviso a ${ADVISOR_F} que volviste a escribirle 👌\n\n` +
    `Te responderá lo antes posible.`,

  fallback: () =>
    `Hmm, no entendí bien 😅\n\n` +
    `Escribe el *número* de la opción que deseas o *"menu"* para ver las opciones.`,

  error: () =>
    `Tuve un pequeño inconveniente técnico 🙏 Intenta de nuevo en un momento.`,
};
