// Один общий огонёк гирлянды (story 2.1): регистрируется через контракт
// рендера слоем 20 поверх ёлки, рисуется по рецептурам docs/style.md —
// скруглённый силуэт, радиальный градиент, блик верх-слева, мягкий ореол.
// Никаких fillRect и второго rAF-цикла: объект живёт только в кадре контракта.

/**
 * Слой гирлянды: поверх ёлки (слой 10) и слоёв мира (5/8).
 */
export const GARLAND_LAYER = 20;

/** Радиус ядра, px; ореол вчетверо больше и остаётся < 10 px. */
export const GARLAND_CORE_RADIUS = 2.4;
export const GARLAND_HALO_SCALE = 4;

export const GARLAND_COLORS = {
  highlight: '#fffdf2',
  core: '#ffc45c',
  shade: '#b46a1e',
  haloNear: 'rgba(255, 226, 156, 0.85)',
  haloMid: 'rgba(255, 198, 96, 0.32)',
  haloFar: 'rgba(255, 176, 64, 0)',
};

/** Положение огонька на ёлке: доли кадра, как у объектов мира. */
function lightPoint(width, height) {
  // Base ёлки совпадает с TREE_BASE_RATIO в src/world.js (0.8); константа
  // не экспортируется, поэтому дублируем значение с явной ссылкой на источник.
  const base = height * 0.8;
  const treeH = Math.min(height * 0.44, width * 0.34);
  return { x: width / 2, y: base - treeH * 0.62 };
}

/**
 * Один шар: сначала мягкий ореол (gradient в прозрачный край), затем ядро
 * с бликом верх-слева. Оба силуэта — arc, ни одного прямоугольника.
 *
 * @param {CanvasRenderingContext2D} ctx 2D-контекст (в тесте — мок)
 * @param {number} x центр огонька
 * @param {number} y центр огонька
 * @param {number} r радиус ядра
 * @returns {void}
 */
function drawLight(ctx, x, y, r) {
  const haloR = r * GARLAND_HALO_SCALE;
  const halo = ctx.createRadialGradient(x, y, 0, x, y, haloR);
  halo.addColorStop(0, GARLAND_COLORS.haloNear);
  halo.addColorStop(0.45, GARLAND_COLORS.haloMid);
  halo.addColorStop(1, GARLAND_COLORS.haloFar);
  ctx.beginPath();
  ctx.arc(x, y, haloR, 0, Math.PI * 2);
  ctx.fillStyle = halo;
  ctx.fill();

  // Источник света общий для сцены — верх-слева (docs/style.md, п.3).
  const core = ctx.createRadialGradient(
    x - r * 0.35,
    y - r * 0.4,
    r * 0.1,
    x,
    y,
    r,
  );
  core.addColorStop(0, GARLAND_COLORS.highlight);
  core.addColorStop(0.35, GARLAND_COLORS.core);
  core.addColorStop(1, GARLAND_COLORS.shade);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = core;
  ctx.fill();
}

/**
 * Регистрирует ровно один огонёк слоя 20 на переданном контракте.
 *
 * @param {{ register: Function }} contract контракт рендера (src/contract.js)
 * @param {number} seed seed визита; пока не влияет на координаты — его
 *   потребитель появится в story 2.3 (раскладка по дате)
 * @param {(t: number) => { layers: { tree: number } }} [progressAt]
 *   прогресс ритуала; огонёк не рисуется, пока ёлки ещё нет (tree <= 0).
 *   Без аргумента рисуется всегда — для изолированных тестов.
 * @returns {void}
 */
export function registerGarland(contract, seed = 0, progressAt = null) {
  void seed; // Осознанно: один огонёк, позиция фиксирована до story 2.3.
  contract.register(
    (ctx, width, height, t) => {
      if (typeof progressAt === 'function') {
        const { tree } = progressAt(t).layers;
        if (tree <= 0) return;
      }
      const { x, y } = lightPoint(width, height);
      drawLight(ctx, x, y, GARLAND_CORE_RADIUS);
    },
    { layer: GARLAND_LAYER },
  );
}
