// Раскладка гирлянды (story 2.3): seed визита определяет положение огонька
// внутри ярусов ёлки; позиции по seed — чистые. Никакого DOM, сети,
// Math.random() и зависимостей. Цвет не чистый от seed: день берётся из
// местного времени (`new Date(seed).getDay()`), поэтому в других часовых
// поясах он может отличаться; в тестах день передаётся явно через
// необязательный `dayIndex`.

/** Цвета семи дней недели, индекс — как у Date.prototype.getDay(): 0 = вс. */
export const GARLAND_DAY_COLORS = Object.freeze([
  '#ffe0a3', // 0 — воскресенье
  '#ffc45c', // 1 — понедельник
  '#ffd166', // 2 — вторник
  '#ffb347', // 3 — среда
  '#ff9a4d', // 4 — четверг
  '#ff7a66', // 5 — пятница
  '#ff8fa3', // 6 — суббота
]);

/** Блик верх-слева общий для всей сцены (docs/style.md, п.3). */
export const GARLAND_HIGHLIGHT = '#fffdf2';

/** Число ярусов и рядов внутри яруса — те же опоры, что и в src/garland.js. */
export const GARLAND_TIER_COUNT = 4;
export const GARLAND_ROW_COUNT = 3;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * FNV-1a с лавинным завершением: смешиваем обе половинки seed (Date.now()
 * больше 32 бит) и номер слота. Хеш чистый и задаёт только позиции;
 * цвет дня в него не входит.
 *
 * @param {number} seed seed визита
 * @param {number} slot номер огонька
 * @returns {number} беззнаковое 32-битное значение
 */
function hash(seed, slot) {
  let h = 2166136261;
  for (const value of [Math.trunc(seed), Math.trunc(slot)]) {
    for (const part of [value >>> 0, Math.floor(value / 4294967296) >>> 0]) {
      h ^= part;
      h = Math.imul(h, 16777619) >>> 0;
    }
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Детерминированная раскладка слота: ярус, ряд, положение поперёк яруса и
 * оттенок. Диапазоны подобраны так, чтобы огонёк оставался внутри силуэта:
 * `down` в src/garland.js принимает значения 0.3/0.5/0.7, `across` — [-1, 1].
 *
 * @param {number} seed seed визита
 * @param {number} slot порядковый номер огонька
 * @returns {{tier: number, row: number, across: number, shade: number}}
 */
export function slotPlacement(seed, slot) {
  const h = hash(seed, slot);
  return {
    tier: h % GARLAND_TIER_COUNT,
    row: (h >>> 2) % GARLAND_ROW_COUNT,
    across: (((h >>> 4) % 1000) / 999) * 2 - 1,
    shade: ((h >>> 14) % 1000) / 999,
  };
}

/**
 * День недели из seed по местному времени браузера. Явный `dayIndex`
 * нужен чистым тестам и не зависит от часового пояса.
 *
 * @param {number} seed seed визита (миллисекунды)
 * @param {number} [dayIndex] день 0..6 вместо вычисления из seed
 * @returns {number} 0..6
 */
export function dayIndexFor(seed, dayIndex) {
  if (Number.isInteger(dayIndex) && dayIndex >= 0 && dayIndex <= 6) return dayIndex;
  const day = Number.isFinite(seed) ? new Date(seed).getDay() : NaN;
  return Number.isInteger(day) && day >= 0 && day <= 6 ? day : 0;
}

/** Основной цвет выбранного дня — та же палитра, что и у палитры огонька. */
export function dayColor(seed, dayIndex) {
  return GARLAND_DAY_COLORS[dayIndexFor(seed, dayIndex)];
}

function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(rgb) {
  return `#${rgb
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

function hexToHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map((value) => value / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h / 6) * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
  const hue = (((h % 360) + 360) % 360) / 360;
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;
  let rgb;
  if (sat === 0) {
    rgb = [light, light, light];
  } else {
    const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
    const p = 2 * light - q;
    const channel = (t) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    rgb = [channel(hue + 1 / 3), channel(hue), channel(hue - 1 / 3)];
  }
  return rgbToHex(rgb.map((value) => value * 255));
}

function rgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Палитра одного огонька: цвет дня с небольшим детерминированным разбросом
 * по номеру слота, три стопа ореола того же дня и затенённый край шара.
 * Ореол и блик остаются общими для сцены по направлению и числу стопов.
 *
 * @param {number} seed seed визита
 * @param {number} slot порядковый номер огонька
 * @param {number} [dayIndex] день 0..6 вместо вычисления из seed
 * @returns {{core: string, shade: string, haloNear: string, haloMid: string, haloFar: string}}
 */
export function lightPalette(seed, slot, dayIndex) {
  const base = dayColor(seed, dayIndex);
  const { shade } = slotPlacement(seed, slot);
  const { h, s, l } = hexToHsl(base);
  // Разброс ±4 п.п. по светлоте: оттенки различимы, но все из семейства дня.
  const spread = (shade - 0.5) * 8;
  return {
    core: hslToHex(h, s + spread * 0.5, l + spread),
    shade: hslToHex(h, s, Math.max(0, l - 26)),
    haloNear: rgba(base, 0.85),
    haloMid: rgba(base, 0.32),
    haloFar: rgba(base, 0),
  };
}
