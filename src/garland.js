// Общая гирлянда (story 2.1 + 2.2 + 2.3): один объект контракта слоем 20
// рисует столько больших огоньков, сколько полных десятков визитов, и остаток
// мелкими — по геометрии ярусов ёлки из src/world.js. Раскладку и цвет дня
// даёт чистый модуль src/garland-layout.js по seed сервера. При count >= 300
// добавляется мягкое тёплое сияние вокруг всей ёлки. Один объект, один
// rAF-цикл контракта, никаких fillRect и второй регистрации.

import {
  GARLAND_HIGHLIGHT,
  GARLAND_ROW_COUNT,
  lightPalette,
  slotPlacement,
} from './garland-layout.js';

/**
 * Слой гирлянды: поверх ёлки (слой 10) и слоёв мира (5/8).
 */
export const GARLAND_LAYER = 20;

/** Радиус ядра мелкого огонька, px; его ореол вчетверо больше (< 10 px). */
export const GARLAND_CORE_RADIUS = 2.4;
export const GARLAND_HALO_SCALE = 4;
/** Большой огонёк — тот же шар drawLight с увеличенным радиусом и ореолом. */
export const GARLAND_BIG_SCALE = 2;
export const GARLAND_BIG_RADIUS = GARLAND_CORE_RADIUS * GARLAND_BIG_SCALE;

/** Порог заполнения ёлки и сияния всей целиком (решение человека 2026-11-22). */
export const GARLAND_GLOW_COUNT = 300;
/** Три стопа тёплого сияния из docs/design-final.html:256–262. */
export const GARLAND_GLOW_STOPS = [
  [0, 'rgba(255,196,100,0.20)'],
  [0.6, 'rgba(255,180,90,0.07)'],
  [1, 'rgba(255,180,90,0)'],
];
/** Внутренний радиус градиента сияния — общий маркер для тестов. */
export const GARLAND_GLOW_INNER_RADIUS = 8;

/** Безопасный локальный набор при недоступном сервере: одинокий огонёк 2.1. */
const LOCAL_STATE = Object.freeze({ count: 1, tens: 0, remainder: 1 });

/**
 * Приводит ответ сервера (или локальный стаб) к состоянию гирлянды. Поля
 * tens/remainder необязательны: если их нет, они битые или не согласованы
 * с count, агрегат выводится из count — клиент не должен терять состояние
 * старого сервера и рисовать огоньки чужого счётчика. Seed из ответа
 * становится частью состояния; без него сохраняется seed регистрации (или
 * предыдущий seed при обновлении через setState).
 *
 * @param {{count?: number, seed?: number, tens?: number, remainder?: number} | null} visit
 * @param {number} [fallbackSeed] seed, если в ответе его нет
 * @returns {{count: number, tens: number, remainder: number, seed: number}}
 */
export function normalizeGarlandState(visit, fallbackSeed = 0) {
  const count = Number.isFinite(visit?.count) && visit.count >= 0
    ? Math.floor(visit.count)
    : 0;
  const seed = Number.isFinite(visit?.seed)
    ? Math.trunc(visit.seed)
    : (Number.isFinite(fallbackSeed) ? Math.trunc(fallbackSeed) : 0);
  const hasAggregate =
    Number.isInteger(visit?.tens) && visit.tens >= 0 &&
    Number.isInteger(visit?.remainder) && visit.remainder >= 0 && visit.remainder < 10 &&
    visit.tens === Math.floor(count / 10) && visit.remainder === count % 10;
  return hasAggregate
    ? { count, tens: visit.tens, remainder: visit.remainder, seed }
    : { count, tens: Math.floor(count / 10), remainder: count % 10, seed };
}

/**
 * Геометрия ярусов ёлки — повторяет константы drawTree из src/world.js
 * (TREE_BASE_RATIO = 0.8, treeH и четыре яруса) — те же опоры для огоньков.
 * Модуль мира не меняем — здесь только локальная копия координат.
 *
 * @param {number} width ширина кадра
 * @param {number} height высота кадра
 * @param {number} [rise] сдвиг ярусов вниз при проявлении ёлки (как в drawTree)
 * @returns {{cx: number, topY: number, treeH: number, tiers: Array<object>}}
 */
function treeGeometry(width, height, rise = 0) {
  const base = height * 0.8 + rise;
  const treeH = Math.min(height * 0.44, width * 0.34);
  const halfW = Math.min(width * 0.17, height * 0.2, treeH * 0.52);
  return {
    cx: width / 2,
    topY: base - treeH,
    treeH,
    tiers: [
      { topY: base - treeH * 0.46, bottomY: base, hw: halfW },
      { topY: base - treeH * 0.7, bottomY: base - treeH * 0.34, hw: halfW * 0.78 },
      { topY: base - treeH * 0.87, bottomY: base - treeH * 0.56, hw: halfW * 0.56 },
      { topY: base - treeH, bottomY: base - treeH * 0.74, hw: halfW * 0.34 },
    ],
  };
}

/**
 * Позиция огонька внутри яруса по хешу (seed, slot): ярус, ряд и положение
 * поперёк приходят из чистого src/garland-layout.js. Границы ярусов и
 * доступные ряды не меняются — огонёк остаётся внутри силуэта ёлки.
 *
 * @param {ReturnType<typeof treeGeometry>} geo геометрия ёлки
 * @param {number} seed seed визита
 * @param {number} slot порядковый номер огонька
 * @returns {{x: number, y: number}}
 */
function lightPoint(geo, seed, slot) {
  const { tier, row, across } = slotPlacement(seed, slot);
  const support = geo.tiers[tier % geo.tiers.length];
  const down = 0.3 + 0.4 * (row / (GARLAND_ROW_COUNT - 1));
  return {
    x: geo.cx + across * support.hw * down * 0.8,
    y: support.topY + (support.bottomY - support.topY) * down,
  };
}

/**
 * Один шар: сначала мягкий ореол (gradient в прозрачный край), затем ядро
 * с бликом верх-слева. Оба силуэта — arc, ни одного прямоугольника.
 *
 * @param {CanvasRenderingContext2D} ctx 2D-контекст (в тесте — мок)
 * @param {number} x центр огонька
 * @param {number} y центр огонька
 * @param {number} r радиус ядра
 * @param {ReturnType<typeof lightPalette>} palette цвета этого огонька
 * @returns {void}
 */
function drawLight(ctx, x, y, r, palette) {
  const haloR = r * GARLAND_HALO_SCALE;
  const halo = ctx.createRadialGradient(x, y, 0, x, y, haloR);
  halo.addColorStop(0, palette.haloNear);
  halo.addColorStop(0.45, palette.haloMid);
  halo.addColorStop(1, palette.haloFar);
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
  core.addColorStop(0, GARLAND_HIGHLIGHT);
  core.addColorStop(0.35, palette.core);
  core.addColorStop(1, palette.shade);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = core;
  ctx.fill();
}

/**
 * Сияние всей ёлки (R4): один радиальный градиент по центру ёлки и один
 * arc, ни одного fillRect (в отличие от концепт-мока docs/design-final.html).
 *
 * @param {CanvasRenderingContext2D} ctx 2D-контекст
 * @param {ReturnType<typeof treeGeometry>} geo геометрия ёлки
 * @returns {void}
 */
function drawGlow(ctx, geo) {
  const cy = geo.topY + geo.treeH * 0.52;
  const radius = geo.treeH * 0.92;
  const glow = ctx.createRadialGradient(
    geo.cx,
    cy,
    GARLAND_GLOW_INNER_RADIUS,
    geo.cx,
    cy,
    radius,
  );
  for (const [stop, color] of GARLAND_GLOW_STOPS) glow.addColorStop(stop, color);
  ctx.beginPath();
  ctx.arc(geo.cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();
}

/**
 * Один кадр гирлянды: сияние под огоньками, затем большие (по числу
 * полных десятков) и мелкие (остаток) шары по слотам ярусов.
 *
 * @param {CanvasRenderingContext2D} ctx 2D-контекст
 * @param {number} width ширина кадра
 * @param {number} height высота кадра
 * @param {{count: number, tens: number, remainder: number, seed: number}} state агрегат
 * @param {number} [treeAlpha] прогресс проявления ёлки; без аргумента = 1
 * @param {boolean} [peakGlow] календарный пик 31 декабря; сияние рисуется
 *   здесь же, одним слоем, даже если счётчик уже перевалил за 300
 * @returns {void}
 */
function drawGarland(ctx, width, height, state, treeAlpha = 1, peakGlow = false) {
  const rise = (1 - treeAlpha) * height * 0.015;
  const geo = treeGeometry(width, height, rise);
  if (state.count >= GARLAND_GLOW_COUNT || peakGlow) drawGlow(ctx, geo);
  let slot = 0;
  for (let i = 0; i < state.tens; i += 1, slot += 1) {
    const { x, y } = lightPoint(geo, state.seed, slot);
    drawLight(ctx, x, y, GARLAND_BIG_RADIUS, lightPalette(state.seed, slot));
  }
  for (let i = 0; i < state.remainder; i += 1, slot += 1) {
    const { x, y } = lightPoint(geo, state.seed, slot);
    drawLight(ctx, x, y, GARLAND_CORE_RADIUS, lightPalette(state.seed, slot));
  }
}

/**
 * Регистрирует ровно один объект слоя 20 на переданном контракте и
 * возвращает хэндл для обновления его состояния из ответа сервера.
 *
 * @param {{ register: Function }} contract контракт рендера (src/contract.js)
 * @param {number} [seed] seed-заглушка до ответа сервера: регистрация
 *   происходит один раз, а seed из POST/GET приходит через setState
 *   в тот же объект
 * @param {(t: number) => { layers: { tree: number } }} [progressAt]
 *   прогресс ритуала; гирлянда не рисуется, пока ёлки нет (tree <= 0).
 *   Без аргумента рисуется всегда — для изолированных тестов.
 * @param {{count?: number, seed?: number, tens?: number, remainder?: number} | null} [initialState]
 *   начальный агрегат; без него — безопасный локальный набор story 2.1
 * @returns {{setState: (visit: object) => void, setPeakGlow: (on: boolean) => void,
 *   readonly state: object, readonly peakGlow: boolean}}
 *   хэндл уже зарегистрированной гирлянды (второй регистрации нет)
 */
export function registerGarland(contract, seed = 0, progressAt = null, initialState = null) {
  let state = normalizeGarlandState(initialState ?? LOCAL_STATE, seed);
  // Календарный пик живёт здесь же: один glow на кадр, под огоньками,
  // с тем же rise во время проявления. Calendar лишь переключает флаг.
  let peakGlow = false;
  contract.register(
    (ctx, width, height, t) => {
      let treeAlpha = 1;
      if (typeof progressAt === 'function') {
        const { tree } = progressAt(t).layers;
        if (tree <= 0) return;
        treeAlpha = tree;
      }
      drawGarland(ctx, width, height, state, treeAlpha, peakGlow);
    },
    { layer: GARLAND_LAYER },
  );
  return {
    /** Принять новый агрегат и seed в тот же объект сцены. */
    setState(next) {
      state = normalizeGarlandState(next, state.seed);
    },
    /** 31 декабря: включить сияние ёлки, не трогая агрегат визитов. */
    setPeakGlow(on) {
      peakGlow = Boolean(on);
    },
    /** Снимок текущего состояния (для тестов и отладки). */
    get state() {
      return { ...state };
    },
    get peakGlow() {
      return peakGlow;
    },
  };
}
