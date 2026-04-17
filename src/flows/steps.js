// ─────────────────────────────────────────────────────────────────────────────
// ESTADOS DEL FLUJO DE CONVERSACIÓN
// ─────────────────────────────────────────────────────────────────────────────
export const STEPS = {
  WELCOME:            'WELCOME',
  MENU:               'MENU',
  CATALOG_TYPE:       'CATALOG_TYPE',
  INFO_VEHICLES:      'INFO_VEHICLES',
  VEHICLE_DETAIL:     'VEHICLE_DETAIL',
  CAPTURE_INTEREST:   'CAPTURE_INTEREST',
  CAPTURE_BUDGET:     'CAPTURE_BUDGET',
  CAPTURE_EMPLOYMENT: 'CAPTURE_EMPLOYMENT',
  CAPTURE_INCOME:     'CAPTURE_INCOME',
  CREDIT_CHECK:       'CREDIT_CHECK',
  ASK_LEAD_NAME:      'ASK_LEAD_NAME',
  ASK_LEAD_PHONE:     'ASK_LEAD_PHONE',
  QUALIFIED:          'QUALIFIED',
  HANDOFF:            'HANDOFF',
  // Estado de "reconexión" tras pausa larga — el cliente elige si seguir con
  // el asesor o volver al menú del bot
  REAWAKEN_CHOICE:    'REAWAKEN_CHOICE',
};

// ─────────────────────────────────────────────────────────────────────────────
// MODOS DE ACTIVACIÓN DEL BOT (reemplaza los booleanos bryantook / handoffMode)
// ─────────────────────────────────────────────────────────────────────────────
export const ACTIVATION_MODE = {
  // Bot respondiendo normalmente
  ACTIVE:             'ACTIVE',
  // El asesor tomó la conversación manualmente (interrumpió al bot)
  PAUSED_BY_ADVISOR:  'PAUSED_BY_ADVISOR',
  // El flujo de calificación completó y el lead fue entregado
  PAUSED_HANDOFF:     'PAUSED_HANDOFF',
  // Pausa manual desde el panel admin (por cliente específico)
  PAUSED_ADMIN:       'PAUSED_ADMIN',
  // El asesor escribió primero a un cliente nuevo. Bot silencioso esperando
  // que el cliente responda para entrar a calificar.
  ARMED_BY_ADVISOR:   'ARMED_BY_ADVISOR',
};

// Conjunto de modos en los que el bot está "pausado" (no responde por flujo normal)
export const PAUSED_MODES = new Set([
  ACTIVATION_MODE.PAUSED_BY_ADVISOR,
  ACTIVATION_MODE.PAUSED_HANDOFF,
  ACTIVATION_MODE.PAUSED_ADMIN,
]);

// ─────────────────────────────────────────────────────────────────────────────
// KEYWORDS
// ─────────────────────────────────────────────────────────────────────────────
export const RESET_KEYWORDS   = ['menu', 'menú', 'reiniciar'];
export const HANDOFF_KEYWORDS = ['asesor', 'hablar con alguien', 'persona', 'humano', 'vendedor'];

// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGO KIA 2026
// ─────────────────────────────────────────────────────────────────────────────
export const KIA_VEHICLES = {
  gasolina: [
    {
      id: 'picanto', title: 'KIA New Picanto', emoji: '🚗', desde: '$59.990.000', tipo: 'gasolina',
      ficha: ['🚗 *KIA New Picanto 2026/2027*','⚙️ 1.0L 66HP / 1.25L 83HP | MT5 / AT4','🪑 5 puestos | 🛡️ Garantía 7 años','','💰 *Versiones:*','• Vibrant MT: $59.990.000','• Vibrant Plus MT: $62.580.000','• Zenith MT: $66.990.000','• Zenith AT: $71.990.000','• GT Line AT: $79.990.000'].join('\n'),
    },
    {
      id: 'k3sedan', title: 'KIA K3 Sedán', emoji: '🚗', desde: '$81.990.000', tipo: 'gasolina',
      ficha: ['🚗 *KIA K3 Sedán 2026/2027*','⚙️ 1.6L 121HP | MT6 / AT6','🪑 5 puestos | 🛡️ Garantía 7 años','','💰 *Versiones:*','• Desire MT: $81.990.000','• Vibrant AT: $88.990.000','• Zenith AT: $94.990.000','• GT Line AT: $106.990.000'].join('\n'),
    },
    {
      id: 'k3cross', title: 'KIA K3 Cross', emoji: '🚗', desde: '$82.990.000', tipo: 'gasolina',
      ficha: ['🚗 *KIA K3 Cross 2026/2027*','⚙️ 1.6L 121HP | MT6 / AT6','🪑 5 puestos | 🛡️ Garantía 7 años','','💰 *Versiones:*','• Vibrant MT: $82.990.000','• Vibrant AT: $89.990.000','• Zenith AT: $96.990.000','• GT Line AT: $107.990.000'].join('\n'),
    },
    {
      id: 'soluto', title: 'KIA Soluto', emoji: '🚗', desde: '$67.990.000', tipo: 'gasolina',
      ficha: ['🚗 *KIA Soluto 2026/2027*','⚙️ 1.4L 94HP | MT5 / AT4','🪑 5 puestos | 🛡️ Garantía 7 años','','💰 *Versiones:*','• Emotion MT: $67.990.000','• Emotion AT: $80.990.000'].join('\n'),
    },
    {
      id: 'sonet', title: 'KIA Sonet', emoji: '🚙', desde: '$90.990.000', tipo: 'gasolina',
      ficha: ['🚙 *KIA Sonet QY2 2026/2027*','⚙️ 1.5L 114HP | MT / IVT','🪑 5 puestos | 🛡️ Garantía 7 años','','💰 *Versiones:*','• Vibrant MT: $90.990.000','• Vibrant MT Doble Tono: $91.990.000','• Vibrant AT: $97.990.000','• Vibrant AT Doble Tono: $98.990.000','• Zenith AT: $111.990.000','• Zenith AT Doble Tono: $112.990.000'].join('\n'),
    },
    {
      id: 'seltos', title: 'KIA Seltos', emoji: '🚙', desde: '$111.990.000', tipo: 'gasolina',
      ficha: ['🚙 *KIA Seltos Corea 2026/2027*','⚙️ 2.0L 147HP | CVT | 4x2 / 4x4','🪑 5 puestos | 🛡️ Garantía 7 años','','💰 *Versiones:*','• Vibrant 4x2: $111.990.000','• Zenith 4x2: $123.990.000'].join('\n'),
    },
    {
      id: 'sportage', title: 'KIA Sportage NQ5', emoji: '🚙', desde: '$130.990.000', tipo: 'gasolina',
      ficha: ['🚙 *KIA Sportage NQ5 2026/2027*','⚙️ 2.0L 154HP / 1.6T 178HP | AT6/AT7','🪑 5 puestos | 🛡️ Garantía 7 años','','💰 *Versiones:*','• Desire 4x2: $130.990.000','• Vibrant 4x2: $145.990.000','• Zenith 4x2: $171.990.000'].join('\n'),
    },
    {
      id: 'k4', title: 'KIA K4', emoji: '🚗', desde: '$138.990.000', tipo: 'gasolina',
      ficha: ['🚗 *KIA K4 2026*','⚙️ 2.0L 150HP | AT6','🪑 5 puestos | 🛡️ Garantía 7 años','','💰 *Versiones:*','• GT Line: $138.990.000'].join('\n'),
    },
    {
      id: 'tasman', title: 'KIA Tasman (Pick-Up)', emoji: '🛻', desde: '$191.990.000', tipo: 'gasolina',
      ficha: ['🛻 *KIA Tasman 2026/2027*','⚙️ Automática | 4x4','🪑 5 puestos | 🛡️ Garantía 7 años','','💰 *Versiones:*','• Desire: $191.990.000','• Vibrant: $237.990.000','• X Line: $262.990.000'].join('\n'),
    },
  ],
  hibrido: [
    {
      id: 'stonic_hev', title: 'KIA New Stonic HEV', emoji: '🌿', desde: '$92.990.000', tipo: 'hibrido',
      ficha: ['🌿 *KIA New Stonic Híbrido 2026/2027*','⚙️ 1.0T MHEV 99HP/118HP | MT6/AT6','🪑 5 puestos | 🛡️ Garantía 7 años','','💰 *Versiones:*','• Desire MT: $92.990.000','• Desire AT: $99.990.000','• Vibrant AT: $107.990.000'].join('\n'),
    },
    {
      id: 'niro_hev', title: 'KIA Niro HEV', emoji: '🌿', desde: '$122.990.000', tipo: 'hibrido',
      ficha: ['🌿 *KIA Niro Híbrido 2026/2027*','⚙️ 1.6L HEV 139HP | DCT6','🪑 5 puestos | 🛡️ Garantía 7 años','','💰 *Versiones:*','• Desire: $122.990.000','• Vibrant: $140.990.000','• Zenith: $148.990.000'].join('\n'),
    },
    {
      id: 'sportage_hev', title: 'KIA Sportage HEV', emoji: '🌿', desde: '$156.990.000', tipo: 'hibrido',
      ficha: ['🌿 *KIA Sportage HEV 2026/2027*','⚙️ 1.6T HEV 178HP | AT7 | 4x2','🪑 5 puestos | 🛡️ Garantía 7 años','','💰 *Versiones:*','• Vibrant HEV: $156.990.000'].join('\n'),
    },
    {
      id: 'sorento_hev', title: 'KIA New Sorento HEV', emoji: '🌿', desde: '$231.990.000', tipo: 'hibrido',
      ficha: ['🌿 *KIA New Sorento HEV 2027*','⚙️ Híbrido HEV | AT | 4x4','🪑 7 puestos | 🛡️ Garantía 7 años','','💰 *Versiones:*','• Zenith HEV: $231.990.000'].join('\n'),
    },
    {
      id: 'carnival_hev', title: 'KIA Carnival HEV', emoji: '🌿', desde: '$271.990.000', tipo: 'hibrido',
      ficha: ['🌿 *KIA Carnival HEV 2026*','⚙️ Híbrido HEV | AT 8vel | 4x2','🪑 8 puestos | 🛡️ Garantía 7 años','','💰 *Versiones:*','• Zenith HEV: $271.990.000'].join('\n'),
    },
  ],
  electrico: [
    {
      id: 'ev3', title: 'KIA EV3 ⚡', emoji: '⚡', desde: '$120.990.000', tipo: 'electrico',
      ficha: ['⚡ *KIA EV3 2025/2026*','🔋 Autonomía: 500+ km | Carga rápida DC','🪑 5 puestos | 🛡️ Garantía 7 años','','💰 *Precio sugerido:*','• Light: $120.990.000','• Light +: $135.990.000','• Light + (2025): $140.990.000'].join('\n'),
    },
    {
      id: 'ev5', title: 'KIA EV5 ⚡', emoji: '⚡', desde: '$155.990.000', tipo: 'electrico',
      ficha: ['⚡ *KIA EV5 2026*','🔋 64.4/88 kWh | Autonomía: 600 km','🪑 5 puestos | 🛡️ Garantía 7 años','','💰 *Precio sugerido:*','• Light: $155.990.000','• Light Plus: $170.990.000','• Wind: $183.990.000'].join('\n'),
    },
    {
      id: 'ev6', title: 'KIA EV6 ⚡', emoji: '⚡', desde: '$252.990.000', tipo: 'electrico',
      ficha: ['⚡ *KIA EV6 2025*','🔋 77.4 kWh | 506 km | 800V ultrarrápido','🪑 5 puestos | 🛡️ Garantía 7 años','','💰 *Precio sugerido:*','• GT Line: $252.990.000'].join('\n'),
    },
    {
      id: 'ev9', title: 'KIA EV9 ⚡', emoji: '⚡', desde: '$360.990.000', tipo: 'electrico',
      ficha: ['⚡ *KIA EV9 2026*','🔋 99.8 kWh | 541 km | AWD','🪑 7 puestos | 🛡️ Garantía 7 años','','💰 *Precio sugerido:*','• GT Line: $360.990.000'].join('\n'),
    },
  ],
};

export const KIA_VEHICLES_FLAT = [
  ...KIA_VEHICLES.gasolina,
  ...KIA_VEHICLES.hibrido,
  ...KIA_VEHICLES.electrico,
];

export const VEHICLE_TYPE_MAP = { '1':'gasolina','2':'hibrido','3':'electrico','4':'todos' };

export const VEHICLE_INDEX_BY_TYPE = {
  gasolina:  { '1':'picanto','2':'k3sedan','3':'k3cross','4':'soluto','5':'sonet','6':'seltos','7':'sportage','8':'k4','9':'tasman' },
  hibrido:   { '1':'stonic_hev','2':'niro_hev','3':'sportage_hev','4':'sorento_hev','5':'carnival_hev' },
  electrico: { '1':'ev3','2':'ev5','3':'ev6','4':'ev9' },
  todos:     { '1':'picanto','2':'k3sedan','3':'k3cross','4':'soluto','5':'sonet','6':'seltos','7':'sportage','8':'k4','9':'tasman','10':'stonic_hev','11':'niro_hev','12':'sportage_hev','13':'sorento_hev','14':'carnival_hev','15':'ev3','16':'ev5','17':'ev6','18':'ev9' },
};

export const BUDGET_MAP = {
  '1': 'Hasta $70 millones',
  '2': '$70 a $100 millones',
  '3': '$100 a $140 millones',
  '4': '$140 a $180 millones',
  '5': 'Más de $180 millones',
};

export const EMPLOYMENT_MAP = { '1':'Empleado','2':'Independiente','3':'Pensionado' };
