// Календарная звезда (epic-calendar, story 2): чистая кривая яркости
// последних 31 дня, объёмный гладкий объект на верхушке ёлки (R12) и пик
// 31 декабря. Само сияние всей ёлки остаётся в гирлянде epic-garland:
// календарь лишь переключает её флаг setPeakGlow, поэтому в пик рисуется
// ровно один glow (под огоньками, с тем же rise ритуала). Слой 21 — над
// гирляндой (20) и ёлкой (10). Никаких fillRect, острых треугольников,
// второго rAF и интервала: кадр приходит от контракта.

import { daysUntilNewYear } from './calendar-date.js';

/** Слой звезды: выше гирлянды epic-garland (слой 20). */
export const CALENDAR_LAYER = 21;

/** Длина окна разгорания: 31 день и меньше — звезда растёт, дальше — нет. */
export const STAR_WINDOW_DAYS = 31;

/** Звезда видна всегда: вне окна 31 дня у неё тихий базовый свет. */
export const STAR_BASE_BRIGHTNESS = 0.04;
/** Внутри окна 31 дня звезда уже заметно ярче базового света. */
export const STAR_MIN_BRIGHTNESS = 0.08;

/**
 * Мягкие лепестки звезды: восемь скруглённых долей вокруг ядра. Углы — в
 * системе canvas (0 — вправо, −π/2 — вверх); reach — вынос центра лепестка
 * от центра звезды, size — его радиус в долях базового радиуса. Симметрия
 * плюс вытянутый верхний луч читается как звезда, а не как набор кругов.
 */
const STAR_LOBES = [
  { angle: -Math.PI / 2, reach: 1.0, size: 0.6 },
  { angle: -Math.PI / 4, reach: 0.72, size: 0.42 },
  { angle: 0, reach: 0.62, size: 0.46 },
  { angle: Math.PI / 4, reach: 0.72, size: 0.42 },
  { angle: Math.PI / 2, reach: 0.52, size: 0.36 },
  { angle: (3 * Math.PI) / 4, reach: 0.6, size: 0.34 },
  { angle: Math.PI, reach: 0.62, size: 0.46 },
  { angle: (-3 * Math.PI) / 4, reach: 0.6, size: 0.34 },
];

/**
 * Яркость звезды по остатку дней: вне окна (> 31) — тихий базовый свет,
 * внутри — линейный рост до 1 ровно 31 декабря. Невалидные значения
 * не ломают кадр (дают 0).
 *
 * @param {number} daysLeft остаток дней до 31 декабря (0 в пик)
 * @returns {number} 0..1
 */
export function starBrightness(daysLeft) {
  if (!Number.isFinite(daysLeft)) return 0;
  if (daysLeft > STAR_WINDOW_DAYS) return STAR_BASE_BRIGHTNESS;
  const days = Math.min(STAR_WINDOW_DAYS, Math.max(0, daysLeft));
  return STAR_MIN_BRIGHTNESS + (1 - STAR_MIN_BRIGHTNESS) * (1 - days / STAR_WINDOW_DAYS);
}

/**
 * Пик — только 31 декабря: ровно день 0, без «почти пика» за один день.
 *
 * @param {number} daysLeft остаток дней
 * @returns {boolean}
 */
export function isPeakDay(daysLeft) {
  return daysLeft === 0;
}

/**
 * Геометрия локальная: повторяет опоры drawTree из src/world.js и ярусов из
 * src/garland.js (base = 0.8h, treeH = min(0.44h, 0.34w)), звезда висит
 * чуть выше верхушки. Все размеры — доли кадра, поэтому ресайз сохраняет
 * пропорции.
 *
 * @param {number} width ширина кадра
 * @param {number} height высота кадра
 * @param {number} [rise] сдвиг ёлки вниз при проявлении (как в гирлянде)
 * @returns {{cx: number, top: number, cy: number, r: number}}
 */
function starGeometry(width, height, rise = 0) {
  const cx = width / 2;
  const treeH = Math.min(height * 0.44, width * 0.34);
  const top = height * 0.8 + rise - treeH;
  const r = Math.min(width, height) * 0.045;
  return { cx, top, cy: top - r * 0.6, r };
}

/**
 * Один мягкий диск: радиальный градиент + arc, без жёсткой обводки.
 * Блик upper-left — общий для сцены: внутренний круг градиента смещён
 * влево-вверх от центра; у ореола смещения нет (он симметричен).
 *
 * @param {CanvasRenderingContext2D} ctx 2D-контекст (в тесте — мок)
 * @param {number} x центр
 * @param {number} y центр
 * @param {number} r радиус
 * @param {Array<[number, string]>} stops стопы градиента
 * @param {boolean} [highlight] блик верх-слева
 * @returns {void}
 */
function paintDisc(ctx, x, y, r, stops, highlight = true) {
  const offset = highlight ? 1 : 0;
  const grad = ctx.createRadialGradient(
    x - r * 0.35 * offset,
    y - r * 0.4 * offset,
    r * 0.06,
    x,
    y,
    r,
  );
  for (const [stop, color] of stops) grad.addColorStop(stop, color);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
}

/**
 * Кадр звезды: ореол, мягкие лепестки и ядро с бликом верх-слева. Сияние
 * всей ёлки здесь НЕ рисуется — его держит гирлянда через setPeakGlow.
 * Радиус ореола и альфа растут с brightness; время даёт лишь ±2.5%
 * детерминированной пульсации. Пока ёлка проявляется, звезда следует за
 * её сдвигом вниз и за её альфой (общий rise с гирляндой, R9/R12).
 *
 * @param {CanvasRenderingContext2D} ctx 2D-контекст (в тесте — мок)
 * @param {number} width ширина кадра
 * @param {number} height высота кадра
 * @param {number} daysLeft остаток дней до 31 декабря
 * @param {number} [t] время кадра в мс
 * @param {number} [treeAlpha] прогресс проявления ёлки (0..1)
 * @returns {void}
 */
export function drawCalendarStar(ctx, width, height, daysLeft, t = 0, treeAlpha = 1) {
  const brightness = starBrightness(daysLeft);
  if (brightness <= 0 || !(treeAlpha > 0)) return;

  const rise = (1 - treeAlpha) * height * 0.015;
  const geo = starGeometry(width, height, rise);
  const time = Number.isFinite(t) ? t : 0;
  const pulse = 1 + 0.025 * Math.sin(time / 850);

  ctx.save();
  ctx.globalAlpha = Math.min(1, treeAlpha);
  try {
    // Ореол: радиус и непрозрачность — от яркости, край растворяется.
    const glowR = geo.r * (2.2 + 2.8 * brightness) * pulse;
    const glowAlpha = 0.18 + 0.5 * brightness;
    paintDisc(ctx, geo.cx, geo.cy, glowR, [
      [0, `rgba(255, 240, 190, ${(glowAlpha * 0.9).toFixed(3)})`],
      [0.45, `rgba(255, 214, 130, ${(glowAlpha * 0.45).toFixed(3)})`],
      [1, 'rgba(255, 200, 110, 0)'],
    ], false);

    const lobeAlpha = 0.55 + 0.4 * brightness;
    for (const lobe of STAR_LOBES) {
      const lx = geo.cx + Math.cos(lobe.angle) * geo.r * lobe.reach;
      const ly = geo.cy + Math.sin(lobe.angle) * geo.r * lobe.reach;
      const lr = geo.r * lobe.size * (0.9 + 0.1 * brightness) * pulse;
      paintDisc(ctx, lx, ly, lr, [
        [0, `rgba(255, 252, 236, ${lobeAlpha.toFixed(3)})`],
        [0.45, `rgba(255, 226, 150, ${(lobeAlpha * 0.75).toFixed(3)})`],
        [1, 'rgba(255, 196, 100, 0)'],
      ]);
    }

    // Ядро: самый светлый участок и блик upper-left (docs/style.md, п.3).
    const coreR = geo.r * 0.62 * (0.92 + 0.08 * brightness) * pulse;
    paintDisc(ctx, geo.cx, geo.cy, coreR, [
      [0, '#fffdf1'],
      [0.42, `rgba(255, 232, 165, ${(0.65 + 0.3 * brightness).toFixed(3)})`],
      [1, 'rgba(255, 190, 90, 0)'],
    ]);
  } finally {
    ctx.restore();
  }
}

/**
 * Регистрирует ровно один объект слоя 21 на контракте рендера. Дата
 * пересчитывается на каждом кадре (день может смениться без перезагрузки),
 * ритуал гасит звезду в тёмной фазе так же, как ёлку. В пик календарь
 * переключает флаг гирлянды setPeakGlow — glow рисуется один раз в её слое.
 * При смене дня вызывается onDayChange, чтобы DOM-счётчик не залипал.
 *
 * @param {{ register: Function }} contract контракт рендера (src/contract.js)
 * @param {() => Date} [dateAt] источник даты; по умолчанию — текущая
 * @param {(t: number) => { layers: { tree: number } }} [progressAt]
 *   прогресс ритуала; при tree <= 0 звезда не рисуется
 * @param {{ setPeakGlow: (on: boolean) => void } | null} [garland]
 *   хэндл гирлянды epic-garland; в изолированных тестах не нужен
 * @param {(daysLeft: number) => void} [onDayChange] обновить счётчик дней
 * @returns {{readonly daysLeft: number, readonly brightness: number}}
 */
export function registerCalendar(
  contract,
  dateAt = () => new Date(),
  progressAt = null,
  garland = null,
  onDayChange = null,
) {
  let daysLeft = daysUntilNewYear(dateAt());
  let brightness = starBrightness(daysLeft);
  let lastPeak = isPeakDay(daysLeft);
  if (garland && typeof garland.setPeakGlow === 'function') garland.setPeakGlow(lastPeak);

  contract.register(
    (ctx, width, height, t) => {
      const nextDays = daysUntilNewYear(dateAt());
      if (nextDays !== daysLeft) {
        daysLeft = nextDays;
        brightness = starBrightness(daysLeft);
        if (typeof onDayChange === 'function') onDayChange(daysLeft);
      }
      const peak = isPeakDay(daysLeft);
      if (garland && typeof garland.setPeakGlow === 'function' && peak !== lastPeak) {
        garland.setPeakGlow(peak);
        lastPeak = peak;
      }
      let treeAlpha = 1;
      if (typeof progressAt === 'function') {
        const { tree } = progressAt(t).layers;
        if (tree <= 0) return;
        treeAlpha = tree;
      }
      drawCalendarStar(ctx, width, height, daysLeft, t, treeAlpha);
    },
    { layer: CALENDAR_LAYER },
  );

  return Object.freeze({
    get daysLeft() {
      return daysLeft;
    },
    get brightness() {
      return brightness;
    },
  });
}
