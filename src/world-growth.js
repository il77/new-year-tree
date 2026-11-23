// Мир вокруг ёлки (epic-world, story tracer): общий счётчик входов уже
// приходит из epic-garland, здесь из него растут новые слои сцены. Города на
// горизонте открываются при счётчике ≥ 10 (слой 6, под лесом и ёлкой), ряд
// маленьких машущих фигур у подножия — при ≥ 30 (слой 9, по бокам от ёлки,
// центральную гирлянду и звезду не закрывает). Порог луча (60) объявлен
// заранее, чтобы последующие story не меняли контракт. Модуль чистый: только
// геометрия и ctx-вызовы, никаких таймеров, rAF, fetch, localStorage и
// Math.random. Стиль — docs/style.md: скруглённые силуэты, градиентный объём,
// блик верх-слева, мягкие тени, ни одного fillRect для объектов сцены.

/** Пороги общего счётчика для слоёв мира (решение Сони 2026-11-23). */
export const WORLD_GROWTH_THRESHOLDS = Object.freeze({
  cities: 10,
  figures: 30,
  beam: 60,
});

/** Слои рендер-контракта: ниже леса (8), ёлки (10), гирлянды (20), звезды (21). */
export const WORLD_GROWTH_LAYERS = Object.freeze({
  cities: 6,
  figures: 9,
  beam: 15,
});

/** Стабильные цвета слоёв — и отрисовка, и маркеры в тестах. */
export const WORLD_GROWTH_COLORS = Object.freeze({
  cityLight: '#6b8db2',
  cityDeep: '#15283c',
  cityHighlight: '#b9d4ef',
  cityGloss: 'rgba(214, 236, 255, 0.38)',
  cityGlossFar: 'rgba(214, 236, 255, 0)',
  windowWarm: '#ffd68a',
  windowFar: 'rgba(255, 190, 90, 0)',
  baseShadow: 'rgba(4, 14, 26, 0.42)',
  baseShadowFar: 'rgba(4, 14, 26, 0)',
  horizonGlow: 'rgba(126, 174, 224, 0.16)',
  horizonGlowFar: 'rgba(126, 174, 224, 0)',
  figureLight: '#9cc3c6',
  figureDeep: '#284150',
  figureHighlight: '#eaf7f2',
  figureGloss: 'rgba(235, 255, 248, 0.52)',
  figureGlossFar: 'rgba(235, 255, 248, 0)',
  figureShadow: 'rgba(4, 14, 26, 0.34)',
  figureShadowFar: 'rgba(4, 14, 26, 0)',
  waveWarm: '#ffd39a',
  waveWarmFar: 'rgba(255, 211, 154, 0)',
});

/** База силуэтов — над снежным полем (0.78h) и лесом (0.74h), под ёлкой. */
const CITY_BASE_RATIO = 0.7;

/**
 * Фиксированный ряд зданий: x/ширина/высота — доли кадра, crown — скругление
 * верхних углов (доля ширины). Постоянный набор даёт одинаковый силуэт во
 * всех кадрах и ровно масштабируется при ресайзе; никакого Math.random.
 */
const CITY_BUILDINGS = Object.freeze([
  { x: 0.07, w: 0.072, h: 0.052, crown: 0.42 },
  { x: 0.18, w: 0.056, h: 0.07, crown: 0.48 },
  { x: 0.3, w: 0.078, h: 0.044, crown: 0.36 },
  { x: 0.43, w: 0.06, h: 0.078, crown: 0.5 },
  { x: 0.57, w: 0.068, h: 0.058, crown: 0.4 },
  { x: 0.71, w: 0.054, h: 0.072, crown: 0.46 },
  { x: 0.84, w: 0.076, h: 0.05, crown: 0.38 },
  { x: 0.94, w: 0.05, h: 0.062, crown: 0.44 },
]);

/** Окна в локальных координатах здания: dx — от центра (доля w), dy — от верха (доля h). */
const CITY_WINDOWS = Object.freeze([
  { dx: -0.24, dy: 0.38 },
  { dx: 0.02, dy: 0.38 },
  { dx: 0.26, dy: 0.38 },
  { dx: -0.16, dy: 0.68 },
  { dx: 0.16, dy: 0.68 },
]);

/** Линия снега, на которой стоят фигуры, и их размер — доли кадра. */
const FIGURE_GROUND_RATIO = 0.9;
const FIGURE_RADIUS_RATIO = 0.022;
/** Масштаб времени взмаха: sin(t / 600 + phase), период ≈ 3.7 с. */
const FIGURE_WAVE_SCALE = 600;

/**
 * Фиксированный ряд фигур. x — доля ширины кадра, scale — рост относительно
 * базового радиуса, phase — сдвиг взмаха. Левая и правая группы стоят по
 * бокам от ёлки (центр 0.33..0.67 кадра остаётся свободным для гирлянды
 * и звезды). Никакого Math.random: ряд одинаков во всех кадрах и тестах.
 */
const FIGURES = Object.freeze([
  { x: 0.09, scale: 0.88, phase: 0.2 },
  { x: 0.15, scale: 1.04, phase: 1.5 },
  { x: 0.21, scale: 0.94, phase: 2.7 },
  { x: 0.27, scale: 0.82, phase: 4.0 },
  { x: 0.73, scale: 0.86, phase: 5.2 },
  { x: 0.79, scale: 1.02, phase: 0.8 },
  { x: 0.85, scale: 0.92, phase: 2.1 },
  { x: 0.91, scale: 0.84, phase: 3.4 },
]);

/**
 * Мягкое тёплое мерцание окна: 0.46..0.78, период ≈ 5.7 с, фаза по номеру
 * окна. Детерминировано по t (мс): одинаковое время даёт одинаковый кадр,
 * соседние кадры отличаются на доли процента — дыхание, не мигание.
 *
 * @param {number} t время кадра в мс
 * @param {number} index номер окна в ряду
 * @returns {number} непрозрачность ядра окна 0..1
 */
function windowAlpha(t, index) {
  const time = Number.isFinite(t) ? t : 0;
  return 0.62 + 0.16 * Math.sin(time / 900 + index * 1.9);
}

/**
 * Мягкое взмахивание руки: -1..1, период ≈ 3.7 с, фаза по номеру фигуры.
 * Одинаковое t даёт одинаковую позу, соседние кадры отличаются на доли
 * пикселя — приветствие, а не мигание. Плохое t приравнивается к нулю.
 *
 * @param {number} t время кадра в мс
 * @param {number} phase фаза фигуры
 * @returns {number} фаза взмаха -1..1
 */
function waveOffset(t, phase) {
  const time = Number.isFinite(t) ? t : 0;
  return Math.sin(time / FIGURE_WAVE_SCALE + phase);
}

/**
 * Счётчик визитов → безопасное неотрицательное целое. Общий агрегат может
 * прийти битым ( старый сервер, сетевой мусор): кадр не должен ломаться.
 *
 * @param {*} n значение счётчика
 * @returns {number} 0, 1, 2, …
 */
function normalizeCount(n) {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Открыт ли слой при текущем счётчике. Неизвестный слой, NaN, infinity и
 * отрицательные значения не открывают ничего.
 *
 * @param {'cities'|'figures'|'beam'} layer имя слоя
 * @param {number} count общий счётчик визитов
 * @returns {boolean}
 */
export function isUnlocked(layer, count) {
  const threshold = WORLD_GROWTH_THRESHOLDS[layer];
  if (!Number.isFinite(threshold)) return false;
  return Number.isFinite(count) && count >= threshold;
}

/**
 * Силуэт здания со скруглённой «шапкой»: боковые стороны и низ — прямые,
 * верх — две квадратичные кривые (не острый треугольник и не прямоугольник).
 * Путь только строится, заливку делает вызывающая сторона.
 *
 * @param {CanvasRenderingContext2D} ctx 2D-контекст (в тесте — мок)
 * @param {number} cx центр здания
 * @param {number} top верх
 * @param {number} w ширина
 * @param {number} h высота
 * @param {number} crown скругление верхних углов (доля w)
 * @returns {void}
 */
function buildingPath(ctx, cx, top, w, h, crown) {
  const left = cx - w / 2;
  const right = cx + w / 2;
  const base = top + h;
  const r = Math.min(w * crown, h * 0.9);
  ctx.beginPath();
  ctx.moveTo(left, base);
  ctx.lineTo(left, top + r);
  ctx.quadraticCurveTo(left, top, left + r, top);
  ctx.lineTo(right - r, top);
  ctx.quadraticCurveTo(right, top, right, top + r);
  ctx.lineTo(right, base);
  ctx.closePath();
}

/**
 * Города на горизонте: ниже порога — ноль вызовов ctx (слой не существует).
 * Над порогом — мягкая дымка, тени у оснований и объёмные здания с окнами.
 * Все координаты и радиусы — доли width/height, поэтому ресайз сохраняет
 * пропорции; время влияет только на альфа ядер окон.
 *
 * @param {CanvasRenderingContext2D} ctx 2D-контекст (в тесте — мок)
 * @param {number} width ширина кадра
 * @param {number} height высота кадра
 * @param {number} count общий счётчик визитов
 * @param {number} [t] время кадра в мс
 * @returns {void}
 */
export function drawCities(ctx, width, height, count, t = 0) {
  if (!isUnlocked('cities', count)) return;
  const w = Number.isFinite(width) && width > 0 ? width : 0;
  const h = Number.isFinite(height) && height > 0 ? height : 0;
  if (w <= 0 || h <= 0) return;

  const baseY = h * CITY_BASE_RATIO;

  // Дымка горизонта: один радиальный градиент с прозрачным краем.
  const horizonR = w * 0.55;
  const horizon = ctx.createRadialGradient(w / 2, baseY, 0, w / 2, baseY, horizonR);
  horizon.addColorStop(0, WORLD_GROWTH_COLORS.horizonGlow);
  horizon.addColorStop(1, WORLD_GROWTH_COLORS.horizonGlowFar);
  ctx.beginPath();
  ctx.arc(w / 2, baseY, horizonR, 0, Math.PI * 2);
  ctx.fillStyle = horizon;
  ctx.fill();

  let windowIndex = 0;
  for (const building of CITY_BUILDINGS) {
    const cx = building.x * w;
    const bw = building.w * w;
    const bh = building.h * h;
    const top = baseY - bh;

    // Мягкая тень у основания (docs/style.md, п.2): радиальный градиент
    // в прозрачный край, рисуется под зданием.
    const shadowR = bw * 0.75;
    const shadow = ctx.createRadialGradient(cx, baseY, 0, cx, baseY, shadowR);
    shadow.addColorStop(0, WORLD_GROWTH_COLORS.baseShadow);
    shadow.addColorStop(1, WORLD_GROWTH_COLORS.baseShadowFar);
    ctx.beginPath();
    ctx.arc(cx, baseY, shadowR, 0, Math.PI * 2);
    ctx.fillStyle = shadow;
    ctx.fill();

    // Объём: внутренний круг градиента смещён влево-вверх от внешнего —
    // общий для сцены источник света (docs/style.md, п.3).
    buildingPath(ctx, cx, top, bw, bh, building.crown);
    const volume = ctx.createRadialGradient(
      cx - bw * 0.28,
      top + bh * 0.12,
      Math.min(bw, bh) * 0.04,
      cx + bw * 0.16,
      top + bh * 0.62,
      Math.max(bw, bh) * 0.95,
    );
    volume.addColorStop(0, WORLD_GROWTH_COLORS.cityHighlight);
    volume.addColorStop(0.4, WORLD_GROWTH_COLORS.cityLight);
    volume.addColorStop(1, WORLD_GROWTH_COLORS.cityDeep);
    ctx.fillStyle = volume;
    ctx.fill();

    // Блик верх-слева: маленький мягкий диск внутри силуэта здания.
    const gx = cx - bw * 0.2;
    const gy = top + bh * 0.22;
    const gr = bw * 0.3;
    const gloss = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
    gloss.addColorStop(0, WORLD_GROWTH_COLORS.cityGloss);
    gloss.addColorStop(1, WORLD_GROWTH_COLORS.cityGlossFar);
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, Math.PI * 2);
    ctx.fillStyle = gloss;
    ctx.fill();

    // Окна: маленькие мягкие диски; только альфа ядра «дышит» по времени.
    for (const win of CITY_WINDOWS) {
      const wx = cx + win.dx * bw;
      const wy = top + win.dy * bh;
      const wr = Math.min(bw, bh) * 0.22;
      const glass = ctx.createRadialGradient(wx, wy, 0, wx, wy, wr);
      glass.addColorStop(0, `rgba(255, 250, 226, ${windowAlpha(t, windowIndex).toFixed(3)})`);
      glass.addColorStop(0.35, WORLD_GROWTH_COLORS.windowWarm);
      glass.addColorStop(1, WORLD_GROWTH_COLORS.windowFar);
      ctx.beginPath();
      ctx.arc(wx, wy, wr, 0, Math.PI * 2);
      ctx.fillStyle = glass;
      ctx.fill();
      windowIndex += 1;
    }
  }
}

/**
 * Тело фигуры — скруглённый «боб»: сужается кверху, низ и бока — только
 * квадратичные кривые. Ни прямоугольника, ни острого треугольника.
 * Путь только строится, заливку делает вызывающая сторона.
 *
 * @param {CanvasRenderingContext2D} ctx 2D-контекст (в тесте — мок)
 * @param {number} cx центр тела
 * @param {number} cy центр тела
 * @param {number} r базовый радиус фигуры
 * @returns {void}
 */
function figureBodyPath(ctx, cx, cy, r) {
  const half = r * 0.78;
  const top = cy - r * 1.28;
  const bottom = cy + r;
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.quadraticCurveTo(cx + half, top + r * 0.12, cx + half * 0.92, cy + r * 0.32);
  ctx.quadraticCurveTo(cx + half * 0.88, bottom, cx, bottom);
  ctx.quadraticCurveTo(cx - half * 0.88, bottom, cx - half * 0.92, cy + r * 0.32);
  ctx.quadraticCurveTo(cx - half, top + r * 0.12, cx, top);
  ctx.closePath();
}

/**
 * Короткая мягкая рука от плеча до кисти: замкнутый скруглённый лоскут,
 * собранный из квадратичных кривых. Заливка — радиальный градиент, обводки
 * нет (docs/style.md, R12).
 *
 * @param {CanvasRenderingContext2D} ctx 2D-контекст (в тесте — мок)
 * @param {number} shoulderX плечо x
 * @param {number} shoulderY плечо y
 * @param {number} elbowX локоть x
 * @param {number} elbowY локоть y
 * @param {number} handX кисть x
 * @param {number} handY кисть y
 * @param {number} thickness половина толщины руки
 * @returns {void}
 */
function figureArmPath(ctx, shoulderX, shoulderY, elbowX, elbowY, handX, handY, thickness) {
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY - thickness);
  ctx.quadraticCurveTo(elbowX, elbowY - thickness * 0.7, handX, handY - thickness * 0.55);
  ctx.quadraticCurveTo(handX + thickness, handY, handX, handY + thickness * 0.55);
  ctx.quadraticCurveTo(elbowX, elbowY + thickness * 0.7, shoulderX, shoulderY + thickness);
  ctx.closePath();
}

/**
 * Машущие фигуры у подножия: ниже порога — ноль вызовов ctx. Над порогом —
 * фиксированный ряд маленьких людей по бокам от ёлки, каждый с мягкой тенью,
 * объёмным телом, круглой головой, бликом верх-слева и одной рукой. Кисть
 * и блик плавно смещаются по sin(t/600 + phase): одинаковое время даёт
 * одинаковый кадр, цвета от времени не зависят. Все координаты и радиусы —
 * доли width/height, поэтому ресайз сохраняет пропорции.
 *
 * @param {CanvasRenderingContext2D} ctx 2D-контекст (в тесте — мок)
 * @param {number} width ширина кадра
 * @param {number} height высота кадра
 * @param {number} count общий счётчик визитов
 * @param {number} [t] время кадра в мс
 * @returns {void}
 */
export function drawFigures(ctx, width, height, count, t = 0) {
  if (!isUnlocked('figures', count)) return;
  const w = Number.isFinite(width) && width > 0 ? width : 0;
  const h = Number.isFinite(height) && height > 0 ? height : 0;
  if (w <= 0 || h <= 0) return;

  const groundY = h * FIGURE_GROUND_RATIO;
  const baseR = Math.min(w, h) * FIGURE_RADIUS_RATIO;

  for (const figure of FIGURES) {
    const r = baseR * figure.scale;
    const cx = figure.x * w;
    const side = figure.x < 0.5 ? -1 : 1;
    const cy = groundY - r * 1.15;
    const wave = waveOffset(t, figure.phase);

    // Мягкая тень на снеге под фигурой: радиальный градиент в прозрачный край.
    const shadowR = r * 1.55;
    const shadow = ctx.createRadialGradient(cx, groundY, 0, cx, groundY, shadowR);
    shadow.addColorStop(0, WORLD_GROWTH_COLORS.figureShadow);
    shadow.addColorStop(1, WORLD_GROWTH_COLORS.figureShadowFar);
    ctx.beginPath();
    ctx.arc(cx, groundY, shadowR, 0, Math.PI * 2);
    ctx.fillStyle = shadow;
    ctx.fill();

    // Тело: внутренний круг градиента смещён влево-вверх — общий для сцены
    // источник света (docs/style.md, п.3).
    figureBodyPath(ctx, cx, cy, r);
    const volume = ctx.createRadialGradient(
      cx - r * 0.34,
      cy - r * 0.48,
      r * 0.05,
      cx + r * 0.16,
      cy + r * 0.3,
      r * 1.6,
    );
    volume.addColorStop(0, WORLD_GROWTH_COLORS.figureHighlight);
    volume.addColorStop(0.42, WORLD_GROWTH_COLORS.figureLight);
    volume.addColorStop(1, WORLD_GROWTH_COLORS.figureDeep);
    ctx.fillStyle = volume;
    ctx.fill();

    // Одна округлая голова с тем же направлением света.
    const headR = r * 0.38;
    const headY = cy - r * 1.28 - headR * 0.7;
    const head = ctx.createRadialGradient(
      cx - headR * 0.35,
      headY - headR * 0.4,
      headR * 0.05,
      cx + headR * 0.12,
      headY + headR * 0.2,
      headR * 1.5,
    );
    head.addColorStop(0, WORLD_GROWTH_COLORS.figureHighlight);
    head.addColorStop(0.45, WORLD_GROWTH_COLORS.figureLight);
    head.addColorStop(1, WORLD_GROWTH_COLORS.figureDeep);
    ctx.beginPath();
    ctx.arc(cx, headY, headR, 0, Math.PI * 2);
    ctx.fillStyle = head;
    ctx.fill();

    // Мягкий блик верх-слева: его центр чуть дышит вместе со взмахом.
    const glowX = cx - r * 0.34 + wave * r * 0.05;
    const glowY = cy - r * 0.58;
    const glowR = r * 0.52;
    const gloss = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, glowR);
    gloss.addColorStop(0, WORLD_GROWTH_COLORS.figureGloss);
    gloss.addColorStop(1, WORLD_GROWTH_COLORS.figureGlossFar);
    ctx.beginPath();
    ctx.arc(glowX, glowY, glowR, 0, Math.PI * 2);
    ctx.fillStyle = gloss;
    ctx.fill();

    // Одна машущая рука: кисть — плавная функция времени, локоть чуть
    // следует за ней. Ладонь — маленький тёплый диск с прозрачным краем.
    const shoulderX = cx + side * r * 0.5;
    const shoulderY = cy - r * 0.32;
    const elbowX = cx + side * r * 0.92;
    const elbowY = cy - r * (0.72 + wave * 0.08);
    const handX = cx + side * r * (1.12 + wave * 0.18);
    const handY = cy - r * (1.12 + wave * 0.36);
    const thickness = r * 0.2;
    figureArmPath(ctx, shoulderX, shoulderY, elbowX, elbowY, handX, handY, thickness);
    const limb = ctx.createRadialGradient(handX, handY, 0, shoulderX, shoulderY, r * 1.4);
    limb.addColorStop(0, WORLD_GROWTH_COLORS.figureLight);
    limb.addColorStop(1, WORLD_GROWTH_COLORS.figureDeep);
    ctx.fillStyle = limb;
    ctx.fill();

    const handR = r * 0.34;
    const hand = ctx.createRadialGradient(handX, handY, 0, handX, handY, handR);
    hand.addColorStop(0, WORLD_GROWTH_COLORS.waveWarm);
    hand.addColorStop(1, WORLD_GROWTH_COLORS.waveWarmFar);
    ctx.beginPath();
    ctx.arc(handX, handY, handR, 0, Math.PI * 2);
    ctx.fillStyle = hand;
    ctx.fill();
  }
}

/**
 * Регистрирует ровно два объекта на переданном контракте: города слоя 6 и
 * машущие фигуры слоя 9. Оба берут один и тот же счётчик из setCount (POST и
 * GET-опрос идут в один хэндл) и гаснут в тёмной фазе вместе с ёлкой.
 *
 * @param {{ register: Function }} contract контракт рендера (src/contract.js)
 * @param {(t: number) => { layers: { tree: number } }} [progressAt]
 *   прогресс ритуала; при tree <= 0 не рисуется ни города, ни фигуры.
 *   Без аргумента слои рисуются всегда — для изолированных тестов.
 * @returns {{setCount: (n: number) => void, readonly count: number,
 *   isUnlocked: (layer: string) => boolean}} хэндл общего счётчика
 */
export function registerWorldGrowth(contract, progressAt = null) {
  let count = 0;

  /** Общая обёртка обоих слоёв: тёмная фаза гасит их вместе с ёлкой. */
  const visibleDraw = (draw) => (ctx, width, height, t) => {
    if (typeof progressAt === 'function') {
      const tree = progressAt(t)?.layers?.tree;
      if (!(tree > 0)) return;
    }
    draw(ctx, width, height, count, t);
  };

  contract.register(visibleDraw(drawCities), { layer: WORLD_GROWTH_LAYERS.cities });
  contract.register(visibleDraw(drawFigures), { layer: WORLD_GROWTH_LAYERS.figures });

  return Object.freeze({
    /** Принять общий счётчик в оба объекта сцены. */
    setCount(n) {
      count = normalizeCount(n);
    },
    /** Текущий (округлённый, неотрицательный) счётчик для тестов и отладки. */
    get count() {
      return count;
    },
    /** Открыт ли слой при текущем счётчике. */
    isUnlocked(layer = 'cities') {
      return isUnlocked(layer, count);
    },
  });
}
