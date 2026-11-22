// Объекты мира story 1.3: снег, лес, ёлка — чистые функции рендера по
// рецептурам docs/style.md (R12): скруглённые силуэты, градиенты, блик
// верх-слева, мягкие тени, никаких fillRect и острых треугольников.
// Регистрация — через контракт (docs/contract.md), слоями: снег ниже леса,
// лес ниже ёлки — чтобы гирлянда epic-garland (слой 20) легла поверх.
// Живая сцена (story 1.5): движение чистое и детерминированное по t —
// падение/качка/мерцание снежинок и мерцающие огоньки ёлки считаются
// в src/animation.js, здесь только применяются к геометрии.

import { flakeState, twinkleAt } from './animation.js';
import { SPARK_FALL_TO_RATIO } from './ritual.js';

/** Слой снега: самый низкий — рисуется первым, позади леса и ёлки. */
export const LAYER_SNOW = 5;
/** Слой леса: силуэт на горизонте позади ёлки. */
export const LAYER_FOREST = 8;
/** Слой ёлки: поверх леса и снега, под гирляндой (слой 20 у epic-garland). */
export const LAYER_TREE = 10;

/** Цвета-маркеры слоёв (используются и в тестах для распознавания слоя). */
export const WORLD_COLORS = {
  snowLight: '#f4f8ff',
  snowDeep: '#bfd0ea',
  forestLight: '#1b5142',
  forestDeep: '#0a241e',
  treeLight: '#2e9460',
  treeDeep: '#0d3f28',
  trunkLight: '#4a3423',
  trunkDeep: '#2c1f14',
};

/**
 * Детерминированный псевдослучайный хэш [0, 1) — снежинки и силуэт леса
 * одинаковы в каждом кадре и в каждом прогоне тестов (никакого Math.random).
 *
 * @param {number} n порядковый номер
 * @returns {number}
 */
function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Кромка снежного поля (доля высоты) — туда же падает искра.
 * Одна константа на оба смысла (падение искры + геометрия снега):
 * источник — SPARK_FALL_TO_RATIO в src/ritual.js, здесь только псевдоним,
 * чтобы правка тайминга/геометрии не разъехалась по модулям.
 */
export const SNOW_TOP_RATIO = SPARK_FALL_TO_RATIO;
/** Базовая линия леса (доля высоты) — горизонт позади снежного поля. */
const FOREST_BASE_RATIO = 0.74;
/** Основание ёлки (доля высоты) — стоит на снежном поле. */
const TREE_BASE_RATIO = 0.8;

/** Снежинки: фиксированный «рассып», одинаковый во всех кадрах и тестах. */
export const FLAKES = Array.from({ length: 34 }, (_, i) => ({
  xRatio: 0.02 + 0.96 * hash01(i * 2 + 1),
  // Небо до 0.66 высоты — выше леса, поэтому снег-слой (5) не прячет их
  // за силуэтом леса (8).
  yRatio: 0.04 + 0.62 * hash01(i * 2 + 2),
  r: 1.2 + 2.4 * hash01(i * 3 + 7),
  // Стаггер: снежинки проявляются не разом, а волной внутри своего слоя.
  delay: 0.45 * hash01(i * 5 + 13),
  // Живая сцена (story 1.5): параметры движения — тоже из hash01, поэтому
  // «рассып» одинаков в каждом прогоне, а траектории индивидуальны.
  // fallPeriod — время прохождения полосы SNOW_BAND (24–54 с: мягкий снег,
  // не метель), sway*/twinkle* — боковая качка и мерцание (см. flakeState).
  fallPeriod: 24000 + 30000 * hash01(i * 11 + 3),
  swayAmp: 0.006 + 0.008 * hash01(i * 13 + 5),
  swayPeriod: 5200 + 4200 * hash01(i * 17 + 9),
  swayPhase: Math.PI * 2 * hash01(i * 19 + 11),
  twinklePeriod: 3400 + 3600 * hash01(i * 23 + 15),
  twinklePhase: Math.PI * 2 * hash01(i * 29 + 17),
}));

/**
 * Декоративные огоньки ёлки (R11: «огоньки мерцают») — рисуются в слое
 * ёлки (10), под будущей общей гирляндой (слой 20, epic-garland). Позиции
 * и тайминги — из hash01: детерминированы, фазы разные (не мигают в унисон).
 * Радиус ядра ≤ 2.3 px, ореол = ядро × 4 ≤ 10 px — осознанный предел:
 * старые тесты распознают свечение искры фильтром 10 < r < 30, огоньки
 * не должны маскировать проверку «искры в готовом мире нет».
 */
export const TREE_LIGHTS = Array.from({ length: 10 }, (_, i) => ({
  /** Ярус ёлки (0 — нижний, см. tiers в drawTree). */
  tier: i % 4,
  /** Поперёк яруса: −0.5..0.5 (преобразуется в смещение внутри конуса). */
  across: hash01(i * 3 + 21) - 0.5,
  /** Вниз по ярусу: 0.25..0.75 (не у самой кромки и не у острия). */
  down: 0.25 + 0.5 * hash01(i * 5 + 29),
  /** Радиус ядра, px (ореол — вчетверо больше, ≤ 10 px). */
  r: 1.3 + 1.0 * hash01(i * 7 + 31),
  /** Период мерцания, мс (2.6–6.8 с — дыхание, не мигание). */
  period: 2600 + 4200 * hash01(i * 11 + 37),
  /** Фаза мерцания, радианы. */
  phase: Math.PI * 2 * hash01(i * 13 + 41),
}));

/**
 * Мягкий конус-ярус ёлки по рецептуру docs/style.md: боковые стороны —
 * кривые Безье наружу, низ — дуга вниз (без острых треугольников).
 * Путь только строит — заливку (градиент, блик) делает вызывающая сторона.
 *
 * @param {CanvasRenderingContext2D} ctx 2D-контекст (в тесте — мок)
 * @param {number} cx центр по горизонтали
 * @param {number} topY верхняя точка яруса
 * @param {number} bottomY нижняя линия яруса
 * @param {number} halfW половина ширины подола
 * @returns {void}
 */
function tierPath(ctx, cx, topY, bottomY, halfW) {
  const bulge = halfW * 0.18;
  ctx.beginPath();
  ctx.moveTo(cx, topY);
  ctx.quadraticCurveTo(
    cx - halfW * 0.75,
    bottomY - (bottomY - topY) * 0.25,
    cx - halfW,
    bottomY,
  );
  ctx.quadraticCurveTo(cx, bottomY + bulge, cx + halfW, bottomY);
  ctx.quadraticCurveTo(
    cx + halfW * 0.75,
    bottomY - (bottomY - topY) * 0.25,
    cx,
    topY,
  );
  ctx.closePath();
}

/**
 * Скруглённый прямоугольник (бревно ёлки) — рецепт docs/style.md.
 *
 * @param {CanvasRenderingContext2D} ctx 2D-контекст
 * @param {number} x левый край
 * @param {number} y верх
 * @param {number} w ширина
 * @param {number} h высота
 * @param {number} r радиус скругления
 * @returns {void}
 */
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Мягкий блик верх-слева (R12): радиальный градиент от пика к прозрачному
 * краю. Вынесен из трёх рецептов (снег, лес, ёлка) — последовательность
 * вызовов ctx и их аргументы остаются прежними.
 *
 * @param {CanvasRenderingContext2D} ctx 2D-контекст (в тесте — мок)
 * @param {number} x центр блика
 * @param {number} y центр блика
 * @param {number} radius радиус растворяющегося края
 * @param {number} peakAlpha непрозрачность в центре (0..1)
 * @returns {void}
 */
function paintGloss(ctx, x, y, radius, peakAlpha) {
  const gloss = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gloss.addColorStop(0, `rgba(255, 255, 255, ${peakAlpha})`);
  gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gloss;
  ctx.fill();
}

/**
 * Снег: снежное поле с мягкой волнистой кромкой (градиент + блик верх-слева)
 * и детерминированные снежинки-капли со стаггером проявления.
 *
 * @param {CanvasRenderingContext2D} ctx 2D-контекст (в тесте — мок)
 * @param {number} width ширина кадра
 * @param {number} height высота кадра
 * @param {number} alpha непрозрачность слоя 0..1 (прогресс ритуала)
 * @param {number} t время кадра в мс (снег живёт со story 1.5)
 * @returns {void}
 */
export function drawSnow(ctx, width, height, alpha, t) {
  if (alpha <= 0) return;
  const w = width;
  const h = height;
  const y0 = h * SNOW_TOP_RATIO;
  ctx.globalAlpha = alpha;

  // Поле: мягкие сугробы (кромка — цепь квадратичных кривых, не линия).
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, y0 + h * 0.01);
  ctx.quadraticCurveTo(w * 0.18, y0 - h * 0.02, w * 0.38, y0 + h * 0.006);
  ctx.quadraticCurveTo(w * 0.58, y0 + h * 0.022, w * 0.78, y0 - h * 0.012);
  ctx.quadraticCurveTo(w * 0.92, y0 + h * 0.01, w, y0 + h * 0.004);
  ctx.lineTo(w, h);
  ctx.closePath();

  // Объём: вертикальный градиент — светлее у кромки (свет сверху-слева).
  const ground = ctx.createLinearGradient(0, y0 - h * 0.03, 0, h);
  ground.addColorStop(0, WORLD_COLORS.snowLight);
  ground.addColorStop(1, WORLD_COLORS.snowDeep);
  ctx.fillStyle = ground;
  ctx.fill();

  // Блик верх-слева: тот же путь, мягкий радиальный свет вдоль кромки.
  paintGloss(ctx, w * 0.28, y0 + h * 0.02, w * 0.42, 0.32);

  // Снежинки: мягкие капли без жёсткого края, волной по стаггеру;
  // падают/качаются/мерцают по чистому flakeState(t) — живая сцена 1.5.
  for (const flake of FLAKES) {
    const flakeAlpha = Math.min(1, Math.max(0, (alpha - flake.delay) * 3));
    if (flakeAlpha <= 0) continue;
    const state = flakeState(flake, t);
    const x = state.xRatio * w;
    const y = state.yRatio * h;
    ctx.globalAlpha = alpha * flakeAlpha * state.alpha;
    const drop = ctx.createRadialGradient(x, y, 0, x, y, flake.r * 1.5);
    drop.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    drop.addColorStop(0.55, 'rgba(233, 242, 255, 0.55)');
    drop.addColorStop(1, 'rgba(233, 242, 255, 0)');
    ctx.beginPath();
    ctx.arc(x, y, flake.r * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = drop;
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

/**
 * Лес: силуэт дальних елей на горизонте — два яруса-подола на дерево
 * (скруглённые, recipe «мягкий конус») + туманная дымка между планами.
 *
 * @param {CanvasRenderingContext2D} ctx 2D-контекст (в тесте — мок)
 * @param {number} width ширина кадра
 * @param {number} height высота кадра
 * @param {number} alpha непрозрачность слоя 0..1
 * @param {number} t время кадра в мс
 * @returns {void}
 */
export function drawForest(ctx, width, height, alpha, t) {
  if (alpha <= 0) return;
  // Отдельной анимации у леса нет: силуэт дальнего плана живёт общей
  // покачиванием камеры (src/animation.js, story 1.5) — t нужен контракту.
  void t;
  const w = width;
  const h = height;
  const yB = h * FOREST_BASE_RATIO;
  // Едва заметный подъём по мере проявления — мир «всплывает» из темноты.
  const rise = (1 - alpha) * h * 0.01;
  ctx.globalAlpha = alpha;

  // Дымка на горизонте: полупрозрачный градиент (docs/style.md), путь с
  // волнистой верхней кромкой — не прямоугольник (маска, но край мягкий).
  ctx.beginPath();
  ctx.moveTo(0, yB - h * 0.1 + rise);
  ctx.quadraticCurveTo(w * 0.25, yB - h * 0.115 + rise, w * 0.5, yB - h * 0.098 + rise);
  ctx.quadraticCurveTo(w * 0.75, yB - h * 0.085 + rise, w, yB - h * 0.1 + rise);
  ctx.lineTo(w, yB + h * 0.02 + rise);
  ctx.lineTo(0, yB + h * 0.02 + rise);
  ctx.closePath();
  const haze = ctx.createLinearGradient(0, yB - h * 0.1 + rise, 0, yB + h * 0.02 + rise);
  haze.addColorStop(0, 'rgba(24, 58, 74, 0)');
  haze.addColorStop(1, 'rgba(24, 58, 74, 0.35)');
  ctx.fillStyle = haze;
  ctx.fill();

  // Дальний план: детерминированный ряд ёлочек разной высоты.
  const count = Math.max(7, Math.round(w / 150));
  for (let i = 0; i < count; i += 1) {
    const jitter = (hash01(i * 3 + 5) - 0.5) * (w / count) * 0.5;
    const cx = ((i + 0.5) / count) * w + jitter;
    const treeH = h * (0.06 + 0.06 * hash01(i * 7 + 3));
    const halfW = treeH * 0.45;
    const base = yB + rise;
    const top = base - treeH;

    // Два яруса-подола: верхний уже, нижний шире, верхний перекрывает стык.
    const tiers = [
      { topY: top, bottomY: top + treeH * 0.62, hw: halfW * 0.62 },
      { topY: top + treeH * 0.42, bottomY: base, hw: halfW },
    ];
    for (const tier of tiers) {
      tierPath(ctx, cx, tier.topY, tier.bottomY, tier.hw);
      const shadeGrad = ctx.createLinearGradient(0, tier.topY, 0, tier.bottomY);
      shadeGrad.addColorStop(0, WORLD_COLORS.forestLight);
      shadeGrad.addColorStop(1, WORLD_COLORS.forestDeep);
      ctx.fillStyle = shadeGrad;
      ctx.fill();

      // Блик верх-слева (R12, docs/style.md п.2): тот же путь, мягкий
      // радиальный свет — дальний план не исключение из правила света.
      paintGloss(
        ctx,
        cx - tier.hw * 0.4,
        tier.topY + (tier.bottomY - tier.topY) * 0.3,
        tier.hw * 1.1,
        0.14,
      );
    }
  }

  // Тень леса на дальнем снегу: мягкий градиент вниз от базовой линии.
  ctx.beginPath();
  ctx.moveTo(0, yB + rise);
  ctx.lineTo(w, yB + rise);
  ctx.lineTo(w, yB + h * 0.045 + rise);
  ctx.lineTo(0, yB + h * 0.045 + rise);
  ctx.closePath();
  const shade = ctx.createLinearGradient(0, yB + rise, 0, yB + h * 0.045 + rise);
  shade.addColorStop(0, 'rgba(10, 36, 30, 0.75)');
  shade.addColorStop(1, 'rgba(10, 36, 30, 0)');
  ctx.fillStyle = shade;
  ctx.fill();

  ctx.globalAlpha = 1;
}

/**
 * Ёлка: бревно-скруглёнка + четыре яруса-подола с вертикальным градиентом,
 * бликом верх-слева и мягкой тенью-пятном на снегу; поверх ярусов —
 * мерцающие огоньки (живая сцена, story 1.5).
 *
 * @param {CanvasRenderingContext2D} ctx 2D-контекст (в тесте — мок)
 * @param {number} width ширина кадра
 * @param {number} height высота кадра
 * @param {number} alpha непрозрачность слоя 0..1
 * @param {number} t время кадра в мс — мерцание огоньков (чистое по t)
 * @returns {void}
 */
export function drawTree(ctx, width, height, alpha, t) {
  if (alpha <= 0) return;
  const w = width;
  const h = height;
  const cx = w / 2;
  const base = h * TREE_BASE_RATIO;
  const treeH = Math.min(h * 0.44, w * 0.34);
  const halfW = Math.min(w * 0.17, h * 0.2, treeH * 0.52);
  const rise = (1 - alpha) * h * 0.015;
  ctx.globalAlpha = alpha;

  // Мягкая тень на снегу (смещена вправо-вниз — свет сверху-слева).
  const cast = ctx.createRadialGradient(
    cx + halfW * 0.2,
    base + h * 0.012 + rise,
    0,
    cx + halfW * 0.2,
    base + h * 0.012 + rise,
    halfW * 1.3,
  );
  cast.addColorStop(0, 'rgba(12, 30, 26, 0.5)');
  cast.addColorStop(1, 'rgba(12, 30, 26, 0)');
  ctx.beginPath();
  ctx.arc(cx + halfW * 0.2, base + h * 0.012 + rise, halfW * 1.3, 0, Math.PI * 2);
  ctx.fillStyle = cast;
  ctx.fill();

  // Бревно: скруглённый прямоугольник с градиентом.
  const trunkW = Math.max(4, halfW * 0.22);
  const trunkTop = base - treeH * 0.08 + rise;
  roundRectPath(ctx, cx - trunkW / 2, trunkTop, trunkW, base - trunkTop + h * 0.012, trunkW * 0.45);
  const trunk = ctx.createLinearGradient(cx - trunkW, 0, cx + trunkW, 0);
  trunk.addColorStop(0, WORLD_COLORS.trunkLight);
  trunk.addColorStop(1, WORLD_COLORS.trunkDeep);
  ctx.fillStyle = trunk;
  ctx.fill();

  // Ярусы снизу вверх: верхние перекрывают стыки нижних.
  const tiers = [
    { topY: base - treeH * 0.46, bottomY: base, hw: halfW },
    { topY: base - treeH * 0.7, bottomY: base - treeH * 0.34, hw: halfW * 0.78 },
    { topY: base - treeH * 0.87, bottomY: base - treeH * 0.56, hw: halfW * 0.56 },
    { topY: base - treeH, bottomY: base - treeH * 0.74, hw: halfW * 0.34 },
  ];
  for (const tier of tiers) {
    const topY = tier.topY + rise;
    const bottomY = tier.bottomY + rise;
    tierPath(ctx, cx, topY, bottomY, tier.hw);

    // Объём яруса: вертикальный градиент — светлее сверху, темнее к низу.
    const grad = ctx.createLinearGradient(0, topY, 0, bottomY);
    grad.addColorStop(0, WORLD_COLORS.treeLight);
    grad.addColorStop(1, WORLD_COLORS.treeDeep);
    ctx.fillStyle = grad;
    ctx.fill();

    // Блик верх-слева: тот же путь, мягкий радиальный свет слева.
    paintGloss(
      ctx,
      cx - tier.hw * 0.4,
      topY + (bottomY - topY) * 0.35,
      tier.hw * 1.15,
      0.3,
    );
  }

  // Огоньки ёлки (живая сцена, R11: «огоньки мерцают»): ореол-градиент +
  // ядро по рецепту style.md. Мерцание — чистое twinkleAt(t); альфа в
  // [0.35, 0.95] — огонёк не гаснет и не мигает стробоскопом (R10).
  for (const light of TREE_LIGHTS) {
    const tier = tiers[light.tier];
    const topY = tier.topY + rise;
    const bottomY = tier.bottomY + rise;
    const ly = topY + (bottomY - topY) * light.down;
    // Конус сужается кверху: ширина в точке down ≈ hw·down; запас 0.8
    // держит огонёк внутри силуэта независимо от кривых Безье подола.
    const spread = tier.hw * light.down * 0.8;
    const lx = cx + light.across * 2 * spread;
    ctx.globalAlpha = alpha * (0.35 + 0.6 * twinkleAt(t, light.period, light.phase));

    // Ореол: мягкий тёплый свет, край растворяется (без обводок).
    const haloR = light.r * 4;
    const halo = ctx.createRadialGradient(lx, ly, 0, lx, ly, haloR);
    halo.addColorStop(0, 'rgba(255, 227, 156, 0.85)');
    halo.addColorStop(0.45, 'rgba(255, 196, 96, 0.30)');
    halo.addColorStop(1, 'rgba(255, 180, 70, 0)');
    ctx.beginPath();
    ctx.arc(lx, ly, haloR, 0, Math.PI * 2);
    ctx.fillStyle = halo;
    ctx.fill();

    // Ядро: тёплая точка с бликом верх-слева (свет один на всю сцену).
    const core = ctx.createRadialGradient(
      lx - light.r * 0.3,
      ly - light.r * 0.35,
      light.r * 0.1,
      lx,
      ly,
      light.r,
    );
    core.addColorStop(0, '#fff7e2');
    core.addColorStop(1, 'rgba(255, 200, 120, 0.95)');
    ctx.beginPath();
    ctx.arc(lx, ly, light.r, 0, Math.PI * 2);
    ctx.fillStyle = core;
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

/**
 * Регистрирует объекты мира на контракте слоями (снег → лес → ёлка).
 * Вызывается один раз; гирлянда (слой 20) ляжет поверх ёлки без знания
 * содержимого объектов — см. docs/contract.md.
 *
 * @param {{ register: Function }} contract контракт рендера
 * @param {(t: number) => { layers: { snow: number, forest: number, tree: number } }} progressAt
 *   функция прогресса ритуала по времени кадра (берётся из контроллера ritual)
 * @returns {void}
 */
export function registerWorld(contract, progressAt) {
  contract.register(
    (ctx, width, height, t) => {
      const { snow } = progressAt(t).layers;
      if (snow > 0) drawSnow(ctx, width, height, snow, t);
    },
    { layer: LAYER_SNOW },
  );
  contract.register(
    (ctx, width, height, t) => {
      const { forest } = progressAt(t).layers;
      if (forest > 0) drawForest(ctx, width, height, forest, t);
    },
    { layer: LAYER_FOREST },
  );
  contract.register(
    (ctx, width, height, t) => {
      const { tree } = progressAt(t).layers;
      if (tree > 0) drawTree(ctx, width, height, tree, t);
    },
    { layer: LAYER_TREE },
  );
}
