import { getRedisClient } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { KIA_VEHICLES, KIA_VEHICLES_FLAT } from '../flows/steps.js';

const PRICES_KEY = 'kia:prices';

// Cargar precios desde Redis, si no hay usa los del código
export async function getPrices() {
  const redis = getRedisClient();
  try {
    const raw = await redis.get(PRICES_KEY);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    logger.error(`[Prices] Error leyendo precios: ${err.message}`);
  }
  return null; // fallback a steps.js
}

// Guardar precios parseados del Excel en Redis
export async function savePrices(vehicles) {
  const redis = getRedisClient();
  try {
    await redis.set(PRICES_KEY, JSON.stringify(vehicles));
    logger.info(`[Prices] Precios actualizados en Redis — ${vehicles.length} versiones`);
    return true;
  } catch (err) {
    logger.error(`[Prices] Error guardando precios: ${err.message}`);
    return false;
  }
}

// Parsear Excel y convertir a estructura de vehículos
export function parseExcelPrices(workbook) {
  const XLSX = workbook;
  const sheetName = XLSX.SheetNames[0];
  const sheet = XLSX.Sheets[sheetName];

  // Importar dinámicamente para parsear
  const rows = [];
  const range = sheet['!ref'];
  if (!range) return null;

  // Reconstruir fichas por modelo agrupando versiones
  const modelMap = {};

  Object.keys(sheet).forEach(cell => {
    if (cell.startsWith('!')) return;
    const col = cell.replace(/\d/g, '');
    const row = parseInt(cell.replace(/\D/g, ''), 10);
    if (row === 1) return; // encabezado

    if (!rows[row]) rows[row] = {};
    rows[row][col] = sheet[cell].v;
  });

  rows.forEach(row => {
    if (!row) return;
    const modelo  = (row['A'] || '').toString().trim();
    const version = (row['B'] || '').toString().trim();
    const precio  = parseFloat((row['C'] || '0').toString().replace(/[^0-9.]/g, ''));
    const tipo    = (row['D'] || 'gasolina').toString().trim().toLowerCase();
    const id      = modelo.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    if (!modelo || !version || !precio) return;

    if (!modelMap[id]) {
      modelMap[id] = {
        id,
        title: modelo,
        tipo,
        emoji: tipo === 'electrico' ? '⚡' : tipo === 'hibrido' ? '🌿' : '🚗',
        desde: `$${(precio / 1_000_000).toFixed(1)}M`,
        ficha: `🚗 *${modelo}*\n\n💰 *Versiones:*\n`,
        versiones: [],
      };
    }

    modelMap[id].versiones.push(`• ${version}: $${precio.toLocaleString('es-CO')}`);
    // Actualizar desde con el precio más bajo
    const minPrecio = Math.min(...modelMap[id].versiones.map(v => {
      const match = v.match(/\$([\d.,]+)/);
      return match ? parseFloat(match[1].replace(/[.,]/g, '')) : Infinity;
    }));
    modelMap[id].desde = `$${(minPrecio / 1_000_000).toFixed(3).replace('.', '.')}M`;
  });

  // Construir ficha completa
  const result = Object.values(modelMap).map(m => ({
    ...m,
    ficha: `🚗 *${m.title}*\n🛡️ Garantía 7 años\n\n💰 *Versiones:*\n${m.versiones.join('\n')}`,
  }));

  return result.length > 0 ? result : null;
}
