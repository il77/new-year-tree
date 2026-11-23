// Мир вокруг ёлки (epic-world, story tracer): пороги, города, машущие фигуры,
// луч из верхушки и регистрация трёх слоёв (6, 9 и 15). Тесты чистые —
// node:test + общий мок ctx из scripts/mock-ctx.js, без jsdom, зависимостей
// и живого времени.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMockCtx, callsNamed } from '../scripts/mock-ctx.js';
import {
  WORLD_GROWTH_COLORS,
  WORLD_GROWTH_LAYERS,
  WORLD_GROWTH_THRESHOLDS,
  drawBeam,
  drawCities,
  drawFigures,
  isUnlocked,
  registerWorldGrowth,
} from '../src/world-growth.js';

const W = 1280;
const H = 800;
const WINDOW_CORE_PREFIX = 'rgba(255, 250, 226, ';
/** Вызовы, у которых все числовые аргументы — координаты/радиусы долей кадра. */
const GEOMETRY_CALLS = new Set([
  'arc',
  'arcTo',
  'moveTo',
  'lineTo',
  'quadraticCurveTo',
  'createLinearGradient',
  'createRadialGradient',
]);

/** Изолированный контракт: запоминает обе регистрации и их слои. */
function trackingContract(progressAt = null) {
  const registrations = [];
  const contract = {
    register(draw, options) {
      registrations.push({ draw, options });
    },
  };
  const handle = registerWorldGrowth(contract, progressAt);
  return {
    handle,
    registrations,
    draws: registrations.map((registration) => registration.draw),
  };
}

/** Альфа ядер окон в кадре — по стопам градиентов. */
function windowAlphas(ctx) {
  return callsNamed(ctx, 'addColorStop')
    .filter((call) => typeof call.args[1] === 'string' && call.args[1].startsWith(WINDOW_CORE_PREFIX))
    .map((call) => Number.parseFloat(call.args[1].slice(WINDOW_CORE_PREFIX.length)));
}

/**
 * Снимок вызовов без identity градиентных объектов: мок записывает в
 * fillStyle сам объект градиента, у двух кадров он разный, хотя стопы и
 * геометрия одинаковы. Сравниваем именно нарисованное.
 */
function snapshot(calls) {
  return calls.map(({ name, args }) => ({
    name,
    args: args.map((value) => (value !== null && typeof value === 'object' ? '<gradient>' : value)),
  }));
}

test('пороги ровно 10/30/60, слои 6/9/15; isUnlocked устойчив к мусору', () => {
  assert.deepEqual({ ...WORLD_GROWTH_THRESHOLDS }, { cities: 10, figures: 30, beam: 60 });
  assert.deepEqual({ ...WORLD_GROWTH_LAYERS }, { cities: 6, figures: 9, beam: 15 });
  assert.ok(Object.isFrozen(WORLD_GROWTH_THRESHOLDS));
  assert.ok(Object.isFrozen(WORLD_GROWTH_LAYERS));
  for (const key of [
    'cityLight',
    'cityDeep',
    'windowWarm',
    'figureLight',
    'figureDeep',
    'figureHighlight',
    'figureShadow',
    'waveWarm',
    'beamCore',
    'beamMid',
    'beamFar',
    'beamGlow',
  ]) {
    assert.equal(typeof WORLD_GROWTH_COLORS[key], 'string', `${key} — стабильный цвет`);
  }

  assert.equal(isUnlocked('cities', 9), false);
  assert.equal(isUnlocked('cities', 10), true);
  assert.equal(isUnlocked('figures', 29), false);
  assert.equal(isUnlocked('figures', 30), true);
  assert.equal(isUnlocked('beam', 59), false);
  assert.equal(isUnlocked('beam', 60), true);
  for (const bad of [-1, -100, NaN, Infinity, -Infinity, undefined, null]) {
    assert.equal(isUnlocked('cities', bad), false, `${String(bad)} не открывает слой`);
  }
  assert.equal(isUnlocked('unknown', 1000), false, 'неизвестный слой не открывается');
});

test('drawCities: ниже порога ноль вызовов, с 10 — дуги и градиенты', () => {
  const below = createMockCtx();
  drawCities(below, W, H, 9);
  assert.equal(below.calls.length, 0, 'до порога слой не рисуется вообще');

  for (const bad of [-3, NaN, Infinity, -Infinity, undefined, null]) {
    const ctx = createMockCtx();
    drawCities(ctx, W, H, bad);
    assert.equal(ctx.calls.length, 0, `${String(bad)} — пустой кадр`);
  }

  const at = createMockCtx();
  drawCities(at, W, H, 10);
  assert.ok(callsNamed(at, 'arc').length > 0, 'дуги-силуэты появились');
  assert.ok(callsNamed(at, 'createRadialGradient').length > 0, 'градиентный объём появился');
  assert.ok(callsNamed(at, 'fill').length > 0, 'фигуры залиты');

  const above = createMockCtx();
  drawCities(above, W, H, 37, 1000);
  assert.ok(above.calls.length > 0, 'выше порога слой остаётся');
});

test('drawFigures: ниже порога ноль вызовов, с 30 — дуги, кривые, градиенты и заливки', () => {
  const below = createMockCtx();
  drawFigures(below, W, H, 29);
  assert.equal(below.calls.length, 0, 'до порога фигуры не рисуются вообще');

  for (const bad of [-3, NaN, Infinity, -Infinity, undefined, null]) {
    const ctx = createMockCtx();
    drawFigures(ctx, W, H, bad);
    assert.equal(ctx.calls.length, 0, `${String(bad)} — пустой кадр`);
  }

  // Битый размер не должен открывать слой даже при достойном счётчике.
  for (const [badW, badH] of [
    [0, H],
    [W, 0],
    [-3, H],
    [W, -3],
    [NaN, H],
    [W, NaN],
    [Infinity, H],
    [W, Infinity],
    [undefined, H],
    [W, null],
  ]) {
    const ctx = createMockCtx();
    drawFigures(ctx, badW, badH, 30);
    assert.equal(ctx.calls.length, 0, `размер ${String(badW)}×${String(badH)} — пустой кадр`);
  }

  const at = createMockCtx();
  drawFigures(at, W, H, 30, 1234);
  assert.ok(callsNamed(at, 'arc').length > 0, 'круглые головы, ладони и тени появились');
  assert.ok(callsNamed(at, 'quadraticCurveTo').length > 0, 'тела и руки скруглены кривыми');
  assert.ok(callsNamed(at, 'createRadialGradient').length > 0, 'градиентный объём появился');
  assert.ok(callsNamed(at, 'fill').length > 0, 'фигуры залиты');

  const above = createMockCtx();
  drawFigures(above, W, H, 37, 1000);
  assert.ok(above.calls.length > 0, 'выше порога слой остаётся');
});

test('drawBeam: ниже 59 ноль вызовов, с 60 — кривые, дуги, градиенты и заливки', () => {
  const below = createMockCtx();
  drawBeam(below, W, H, 59);
  assert.equal(below.calls.length, 0, 'до порога луч не рисуется вообще');

  for (const bad of [-3, NaN, Infinity, -Infinity, undefined, null]) {
    const ctx = createMockCtx();
    drawBeam(ctx, W, H, bad);
    assert.equal(ctx.calls.length, 0, `${String(bad)} — пустой кадр`);
  }

  // Битый размер не должен открывать слой даже при достойном счётчике.
  for (const [badW, badH] of [
    [0, H],
    [W, 0],
    [-3, H],
    [W, -3],
    [NaN, H],
    [W, NaN],
    [Infinity, H],
    [W, Infinity],
    [undefined, H],
    [W, null],
  ]) {
    const ctx = createMockCtx();
    drawBeam(ctx, badW, badH, 60);
    assert.equal(ctx.calls.length, 0, `размер ${String(badW)}×${String(badH)} — пустой кадр`);
  }

  const at = createMockCtx();
  drawBeam(at, W, H, 60, 1234);
  assert.ok(callsNamed(at, 'quadraticCurveTo').length > 0, 'конусы собраны скруглёнными кривыми');
  assert.ok(callsNamed(at, 'arc').length > 0, 'мягкие диски свечения появились');
  assert.ok(callsNamed(at, 'createLinearGradient').length > 0, 'градиентный объём появился');
  assert.ok(callsNamed(at, 'createRadialGradient').length > 0, 'мягкое свечение появилось');
  assert.ok(callsNamed(at, 'fill').length > 0, 'фигуры луча залиты');

  // Начало луча — ровно верхушка ёлки из src/world.js: base = 0.8h,
  // treeH = min(0.44h, 0.34w), rise = 0.
  const top = H * 0.8 - Math.min(H * 0.44, W * 0.34);
  const source = callsNamed(at, 'createLinearGradient')[0];
  assert.equal(source.args[0], W / 2, 'луч идёт из центра кадра');
  assert.ok(Math.abs(source.args[1] - top) < 1e-9, 'луч начинается в верхушке ёлки');
  assert.ok(source.args[3] < top, 'далёкий конец уходит в небо');

  const above = createMockCtx();
  drawBeam(above, W, H, 61, 1000);
  assert.ok(above.calls.length > 0, 'выше порога слой остаётся');
});

test('setCount клампит счётчик, хэндл только для чтения, регистрация ровно трёх объектов', () => {
  const { handle, registrations, draws } = trackingContract();
  assert.equal(registrations.length, 3, 'четвёртого объекта нет');
  assert.deepEqual(
    registrations.map((registration) => registration.options.layer),
    [WORLD_GROWTH_LAYERS.cities, WORLD_GROWTH_LAYERS.figures, WORLD_GROWTH_LAYERS.beam],
  );
  assert.deepEqual(
    registrations.map((registration) => registration.options.layer),
    [6, 9, 15],
    'города под лесом (8), фигуры под ёлкой (10), луч над ёлкой, но под гирляндой (20)',
  );

  assert.equal(handle.count, 0);
  assert.equal(handle.isUnlocked('cities'), false);
  handle.setCount(12.9);
  assert.equal(handle.count, 12, 'дробный счётчик округляется вниз');
  assert.equal(handle.isUnlocked('cities'), true);
  assert.equal(handle.isUnlocked('figures'), false);
  assert.equal(handle.isUnlocked('beam'), false);

  // Один setCount питает все три объекта: при 12 виден только город.
  const renderAll = () => draws.map((draw) => {
    const ctx = createMockCtx();
    draw(ctx, W, H, 0);
    return ctx;
  });
  const at12 = renderAll();
  assert.ok(at12[0].calls.length > 0, 'города при 12 уже нарисованы');
  assert.equal(at12[1].calls.length, 0, 'фигуры при 12 ещё спят');
  assert.equal(at12[2].calls.length, 0, 'луч при 12 ещё спит');

  for (const bad of [-5, NaN, Infinity, -Infinity, undefined, null]) {
    handle.setCount(bad);
    assert.equal(handle.count, 0, `${String(bad)} → 0`);
  }
  handle.setCount(30);
  assert.equal(handle.isUnlocked('figures'), true);
  assert.equal(handle.isUnlocked('beam'), false);

  // Тот же хэндл открыл фигуры без новой регистрации; луч всё ещё ждёт 60.
  const at30 = renderAll();
  assert.ok(at30[0].calls.length > 0, 'города остались при 30');
  assert.ok(at30[1].calls.length > 0, 'фигуры появились из того же setCount');
  assert.equal(at30[2].calls.length, 0, 'луч при 30 ещё спит');

  handle.setCount(60);
  assert.equal(handle.isUnlocked('beam'), true);
  const at60 = renderAll();
  assert.ok(
    at60.every((ctx) => ctx.calls.length > 0),
    'при 60 все три слоя рисуются из одного и того же счётчика',
  );
  assert.throws(() => {
    handle.count = 999;
  }, TypeError, 'count доступен только на чтение');
});

test('тёмная фаза гасит все три слоя; частичное проявление рисует все открытые', () => {
  const dark = trackingContract(() => ({ layers: { tree: 0 } }));
  dark.handle.setCount(60);
  const darkCtxs = dark.draws.map((draw) => {
    const ctx = createMockCtx();
    draw(ctx, W, H, 1000);
    return ctx;
  });
  assert.ok(
    darkCtxs.every((ctx) => ctx.calls.length === 0),
    'пока ёлки нет — нет ни городов, ни фигур, ни луча',
  );

  const growing = trackingContract(() => ({ layers: { tree: 0.4 } }));
  growing.handle.setCount(60);
  const partial = growing.draws.map((draw) => {
    const ctx = createMockCtx();
    draw(ctx, W, H, 1000);
    return ctx;
  });
  assert.ok(
    partial.every((ctx) => ctx.calls.length > 0),
    'при частичном проявлении видны все три открытых слоя',
  );

  // Луч идёт из видимой верхушки: rise = (1 - tree) * height * 0.015.
  const beamSourceY = (contract) => {
    const ctx = createMockCtx();
    contract.draws[2](ctx, W, H, 0);
    return callsNamed(ctx, 'createLinearGradient')[0].args[1];
  };
  const full = trackingContract(() => ({ layers: { tree: 1 } }));
  full.handle.setCount(60);
  const rise = (1 - 0.4) * H * 0.015;
  assert.ok(
    Math.abs(beamSourceY(growing) - beamSourceY(full) - rise) < 1e-9,
    'луч следует за опущенной при проявлении верхушкой ёлки',
  );

  const plain = trackingContract();
  plain.handle.setCount(60);
  const always = plain.draws.map((draw) => {
    const ctx = createMockCtx();
    draw(ctx, W, H, 0);
    return ctx;
  });
  assert.ok(
    always.every((ctx) => ctx.calls.length > 0),
    'без progressAt все три слоя рисуются всегда',
  );
});

test('порядок слоёв: 6 < 9 < 15, все ниже гирлянды 20 и звезды 21', () => {
  // Локальные константы соседних эпиков: контракт менять не нужно.
  const GARLAND_LAYER = 20;
  const CALENDAR_STAR_LAYER = 21;
  const { registrations } = trackingContract();
  const layers = registrations.map((registration) => registration.options.layer);

  assert.deepEqual(layers, [6, 9, 15]);
  for (let i = 1; i < layers.length; i += 1) {
    assert.ok(layers[i - 1] < layers[i], 'слои registration строго возрастают');
  }
  assert.ok(
    layers.every((layer) => layer < GARLAND_LAYER && layer < CALENDAR_STAR_LAYER),
    'новые слои не перекрывают гирлянду и календарную звезду',
  );
});

test('R12 (луч): нет fillRect/stroke, три скруглённых конуса, upper-left блик и прозрачный край', () => {
  const ctx = createMockCtx();
  drawBeam(ctx, W, H, 60, 1234);

  assert.equal(callsNamed(ctx, 'fillRect').length, 0, 'луч — не прямоугольник');
  assert.equal(callsNamed(ctx, 'stroke').length, 0, 'без жёстких обводок');
  assert.ok(callsNamed(ctx, 'quadraticCurveTo').length >= 18, 'три конуса собраны кривыми');
  assert.ok(callsNamed(ctx, 'arc').length >= 2, 'у источника мягкие диски свечения');
  assert.ok(callsNamed(ctx, 'createLinearGradient').length >= 3, 'три градиентных конуса');
  assert.ok(callsNamed(ctx, 'fill').length >= 5, 'все формы луча залиты градиентами');

  const radial = callsNamed(ctx, 'createRadialGradient');
  assert.ok(radial.length >= 2, 'есть радиальное свечение');
  assert.ok(
    radial.some((g) => g.args[0] < g.args[3] && g.args[1] < g.args[4]),
    'внутренний круг блика смещён влево-вверх',
  );

  const stops = callsNamed(ctx, 'addColorStop').map((call) => call.args[1]);
  for (const color of ['beamCore', 'beamMid', 'beamFar', 'beamGlow']) {
    assert.ok(stops.includes(WORLD_GROWTH_COLORS[color]), `стоп ${color} на месте`);
  }
  assert.ok(
    stops.some((color) => typeof color === 'string' && /rgba\(.*,\s*0\)$/.test(color)),
    'далёкий край луча и свечения растворяется в прозрачность',
  );
  assert.ok(WORLD_GROWTH_COLORS.beamFar.endsWith(', 0)'), 'beamFar — полностью прозрачный стоп');

  const top = H * 0.8 - Math.min(H * 0.44, W * 0.34);
  const cones = callsNamed(ctx, 'createLinearGradient');
  assert.ok(cones.every((g) => Math.abs(g.args[1] - top) < 1e-9), 'все конусы идут от верхушки');
  assert.ok(cones.every((g) => g.args[3] < top), 'конусы уходят вверх, в небо');
  assert.ok(
    callsNamed(ctx, 'arc').every((arc) => arc.args[1] <= top + 1e-6),
    'свечение расположено у верхушки, а не у подножия',
  );
});

test('луч при ресайзе 1280×800 → 640×400: все координаты вдвое меньше', () => {
  const big = createMockCtx();
  const small = createMockCtx();
  drawBeam(big, 1280, 800, 60, 1234);
  drawBeam(small, 640, 400, 60, 1234);

  assert.equal(big.calls.length, small.calls.length, 'одинаковый набор вызовов');
  let compared = 0;
  for (let i = 0; i < big.calls.length; i += 1) {
    const first = big.calls[i];
    const second = small.calls[i];
    assert.equal(second.name, first.name);
    if (!GEOMETRY_CALLS.has(first.name)) continue;
    assert.equal(second.args.length, first.args.length);
    first.args.forEach((value, j) => {
      // У arc два последних аргумента — углы (2π), а не координаты.
      if (first.name === 'arc' && j >= 3) {
        assert.equal(value, second.args[j], 'углы дуг не зависят от размера');
        return;
      }
      assert.ok(
        Math.abs(value - second.args[j] * 2) < 1e-9,
        `${first.name}[${j}]: ${value} должен быть вдвое больше ${second.args[j]}`,
      );
    });
    compared += 1;
  }
  assert.ok(compared > 15, 'сравнено достаточно геометрии луча');

  const bigArcs = callsNamed(big, 'arc');
  const smallArcs = callsNamed(small, 'arc');
  assert.ok(bigArcs.length > 0);
  bigArcs.forEach((arc, i) => {
    assert.ok(Math.abs(arc.args[2] - smallArcs[i].args[2] * 2) < 1e-9, 'радиусы масштабируются');
  });
});

test('луч детерминирован: тот же t — тот же кадр, разный t — только дыхание', () => {
  const first = createMockCtx();
  const same = createMockCtx();
  drawBeam(first, W, H, 60, 1234);
  drawBeam(same, W, H, 60, 1234);
  const firstFrame = snapshot(first.calls);
  assert.deepEqual(firstFrame, snapshot(same.calls), 'одинаковое время — одинаковые вызовы');

  const other = createMockCtx();
  drawBeam(other, W, H, 60, 4321);
  const otherFrame = snapshot(other.calls);
  assert.equal(otherFrame.length, firstFrame.length, 'число вызовов от времени не зависит');

  let changedGeometry = 0;
  let alphaChanged = 0;
  for (let i = 0; i < firstFrame.length; i += 1) {
    const original = firstFrame[i];
    const next = otherFrame[i];
    assert.equal(next.name, original.name);
    if (original.name === 'addColorStop' || original.name === 'fillStyle') {
      assert.deepEqual(next, original, 'цвета луча от времени не зависят');
    }
    if (original.name === 'globalAlpha') {
      assert.ok(Math.abs(original.args[0] - next.args[0]) <= 0.1, 'альфа дышит в узких пределах');
      if (JSON.stringify(next) !== JSON.stringify(original)) alphaChanged += 1;
    }
    if (GEOMETRY_CALLS.has(original.name)) {
      original.args.forEach((value, j) => {
        if (original.name === 'arc' && j >= 3) {
          assert.equal(next.args[j], value, 'углы дуг постоянны');
          return;
        }
        if (typeof value !== 'number' || typeof next.args[j] !== 'number') return;
        assert.ok(
          Math.abs(value - next.args[j]) < Math.max(2, Math.abs(value) * 0.08),
          `${original.name}[${j}] меняется лишь на проценты`,
        );
        if (value !== next.args[j]) changedGeometry += 1;
      });
    }
  }
  assert.ok(alphaChanged > 0, 'альфа действительно дышит');
  assert.ok(changedGeometry > 0, 'ширина луча действительно дышит');

  const alphaAt = (t) => {
    const ctx = createMockCtx();
    drawBeam(ctx, W, H, 60, t);
    return callsNamed(ctx, 'globalAlpha')[0].args[0];
  };
  const at0 = alphaAt(0);
  const at40 = alphaAt(40);
  const at650 = alphaAt(650);
  assert.ok(at0 >= 0.9 && at0 <= 1, 'альфа в мягких пределах');
  assert.ok(Math.abs(at40 - at0) < 0.01, 'за 40 мс свечение меняется чуть — без мигания');
  assert.ok(Math.abs(at650 - at0) > 0.015, 'за 650 мс дыхание заметно');
});

test('R12: без fillRect, градиентная заливка, блик upper-left, мягкая тень и свечение', () => {
  const ctx = createMockCtx();
  drawCities(ctx, W, H, 10);

  assert.equal(callsNamed(ctx, 'fillRect').length, 0, 'объекты сцены — не прямоугольники');
  assert.equal(callsNamed(ctx, 'stroke').length, 0, 'без жёстких обводок');
  assert.ok(callsNamed(ctx, 'quadraticCurveTo').length > 0, 'силуэты скруглены кривыми');
  assert.ok(callsNamed(ctx, 'fill').length > 0, 'фигуры залиты градиентами');

  const gradients = callsNamed(ctx, 'createRadialGradient');
  assert.ok(gradients.length > 0, 'есть радиальные градиенты');
  assert.ok(
    gradients.some((g) => g.args[0] < g.args[3] && g.args[1] < g.args[4]),
    'внутренний круг блика смещён влево-вверх',
  );

  const stops = callsNamed(ctx, 'addColorStop').map((call) => call.args[1]);
  for (const color of ['cityLight', 'cityDeep', 'windowWarm', 'baseShadow', 'horizonGlow']) {
    assert.ok(stops.includes(WORLD_GROWTH_COLORS[color]), `стоп ${color} на месте`);
  }
  assert.ok(
    stops.some((color) => typeof color === 'string' && /rgba\(.*,\s*0\)$/.test(color)),
    'край тени/свечения растворяется в прозрачность',
  );
});

test('R12 (фигуры): нет fillRect/stroke, скруглённые тела, блик upper-left, тень и цвета', () => {
  const ctx = createMockCtx();
  drawFigures(ctx, W, H, 30, 1234);

  assert.equal(callsNamed(ctx, 'fillRect').length, 0, 'люди — не прямоугольники');
  assert.equal(callsNamed(ctx, 'stroke').length, 0, 'без жёстких обводок');
  assert.ok(callsNamed(ctx, 'quadraticCurveTo').length > 0, 'тела и руки скруглены кривыми');
  assert.ok(callsNamed(ctx, 'arc').length > 0, 'головы, ладони и тени круглые');
  assert.ok(callsNamed(ctx, 'fill').length > 0, 'фигуры залиты градиентами');

  const gradients = callsNamed(ctx, 'createRadialGradient');
  assert.ok(gradients.length > 0, 'есть радиальные градиенты');
  assert.ok(
    gradients.some((g) => g.args[0] < g.args[3] && g.args[1] < g.args[4]),
    'внутренний круг блика смещён влево-вверх',
  );

  const stops = callsNamed(ctx, 'addColorStop').map((call) => call.args[1]);
  for (const color of [
    'figureLight',
    'figureDeep',
    'figureHighlight',
    'figureGloss',
    'figureShadow',
    'waveWarm',
  ]) {
    assert.ok(stops.includes(WORLD_GROWTH_COLORS[color]), `стоп ${color} на месте`);
  }
  assert.ok(
    stops.some((color) => typeof color === 'string' && /rgba\(.*,\s*0\)$/.test(color)),
    'край тени и блика растворяется в прозрачность',
  );

  const arcs = callsNamed(ctx, 'arc');
  assert.ok(arcs.length > 0);
  assert.ok(
    arcs.every((arc) => arc.args[1] > H * 0.8 && arc.args[1] <= H),
    'ряд стоит у нижней кромки кадра',
  );
  assert.ok(
    arcs.every((arc) => arc.args[0] < W * 0.33 || arc.args[0] > W * 0.67),
    'центр под гирляндой и звездой не закрыт',
  );
});

test('ресайз 1280×800 → 640×400: центры, радиусы и силуэты вдвое меньше', () => {
  const big = createMockCtx();
  const small = createMockCtx();
  drawCities(big, 1280, 800, 12, 0);
  drawCities(small, 640, 400, 12, 0);

  assert.equal(big.calls.length, small.calls.length, 'одинаковый набор вызовов');
  let compared = 0;
  for (let i = 0; i < big.calls.length; i += 1) {
    const first = big.calls[i];
    const second = small.calls[i];
    assert.equal(second.name, first.name);
    if (!GEOMETRY_CALLS.has(first.name)) continue;
    assert.equal(second.args.length, first.args.length);
    first.args.forEach((value, j) => {
      // У arc два последних аргумента — углы (2π), а не координаты.
      if (first.name === 'arc' && j >= 3) {
        assert.equal(value, second.args[j], 'углы дуг не зависят от размера');
        return;
      }
      assert.ok(
        Math.abs(value - second.args[j] * 2) < 1e-9,
        `${first.name}[${j}]: ${value} должен быть вдвое больше ${second.args[j]}`,
      );
    });
    compared += 1;
  }
  assert.ok(compared > 20, 'сравнено достаточно геометрии');

  const bigArcs = callsNamed(big, 'arc');
  const smallArcs = callsNamed(small, 'arc');
  assert.ok(bigArcs.length > 0);
  bigArcs.forEach((arc, i) => {
    assert.ok(Math.abs(arc.args[2] - smallArcs[i].args[2] * 2) < 1e-9, 'радиусы масштабируются');
  });
});

test('фигуры при ресайзе 1280×800 → 640×400: все координаты вдвое меньше', () => {
  const big = createMockCtx();
  const small = createMockCtx();
  drawFigures(big, 1280, 800, 30, 1234);
  drawFigures(small, 640, 400, 30, 1234);

  assert.equal(big.calls.length, small.calls.length, 'одинаковый набор вызовов');
  let compared = 0;
  for (let i = 0; i < big.calls.length; i += 1) {
    const first = big.calls[i];
    const second = small.calls[i];
    assert.equal(second.name, first.name);
    if (!GEOMETRY_CALLS.has(first.name)) continue;
    assert.equal(second.args.length, first.args.length);
    first.args.forEach((value, j) => {
      if (first.name === 'arc' && j >= 3) {
        assert.equal(value, second.args[j], 'углы дуг не зависят от размера');
        return;
      }
      assert.ok(
        Math.abs(value - second.args[j] * 2) < 1e-9,
        `${first.name}[${j}]: ${value} должен быть вдвое больше ${second.args[j]}`,
      );
    });
    compared += 1;
  }
  assert.ok(compared > 100, 'сравнено достаточно геометрии фигур');

  const bigArcs = callsNamed(big, 'arc');
  const smallArcs = callsNamed(small, 'arc');
  assert.ok(bigArcs.length > 0);
  bigArcs.forEach((arc, i) => {
    assert.ok(Math.abs(arc.args[2] - smallArcs[i].args[2] * 2) < 1e-9, 'радиусы масштабируются');
  });
});

test('время детерминировано: тот же t — тот же кадр, разный t — только мерцание окон', () => {
  const first = createMockCtx();
  const same = createMockCtx();
  drawCities(first, W, H, 12, 1234);
  drawCities(same, W, H, 12, 1234);
  const firstFrame = snapshot(first.calls);
  assert.deepEqual(firstFrame, snapshot(same.calls), 'одинаковое время — одинаковые вызовы');

  const other = createMockCtx();
  drawCities(other, W, H, 12, 4321);
  assert.equal(other.calls.length, first.calls.length);
  const otherFrame = snapshot(other.calls);
  let changed = 0;
  for (let i = 0; i < firstFrame.length; i += 1) {
    const original = firstFrame[i];
    const next = otherFrame[i];
    assert.equal(next.name, original.name);
    const isWindowCore =
      original.name === 'addColorStop' &&
      typeof original.args[1] === 'string' &&
      original.args[1].startsWith(WINDOW_CORE_PREFIX);
    if (isWindowCore) {
      assert.ok(next.args[1].startsWith(WINDOW_CORE_PREFIX), 'меняется только ядро окна');
      changed += 1;
    } else {
      assert.deepEqual(next, original, 'геометрия и цвета зданий от времени не зависят');
    }
  }
  assert.ok(changed > 0, 'мерцание окон есть');

  const alphaAt = (t) => {
    const ctx = createMockCtx();
    drawCities(ctx, W, H, 12, t);
    return windowAlphas(ctx);
  };
  const at0 = alphaAt(0);
  const at40 = alphaAt(40);
  const at650 = alphaAt(650);
  assert.equal(at0.length, 40, '8 зданий по 5 окон');
  assert.ok(at0.every((a) => a >= 0.4 && a <= 0.8), 'альфа в мягких пределах');
  at0.forEach((alpha, i) => {
    assert.ok(Math.abs(at40[i] - alpha) < 0.02, 'за 40 мс яркость меняется чуть — без мигания');
  });
  assert.ok(at0.some((alpha, i) => Math.abs(at650[i] - alpha) > 0.02), 'за 650 мс мерцание заметно');
});

test('фигуры детерминированы: тот же t — тот же кадр, разный t — только блик и рука', () => {
  const first = createMockCtx();
  const same = createMockCtx();
  drawFigures(first, W, H, 30, 1234);
  drawFigures(same, W, H, 30, 1234);
  const firstFrame = snapshot(first.calls);
  assert.deepEqual(firstFrame, snapshot(same.calls), 'одинаковое время — одинаковые вызовы');

  const other = createMockCtx();
  drawFigures(other, W, H, 30, 4321);
  const otherFrame = snapshot(other.calls);
  assert.equal(otherFrame.length, firstFrame.length, 'число вызовов от времени не зависит');

  // У каждой фигуры 6 радиальных градиентов и одинаковый блок вызовов.
  // Хвост блока (7 блик + 11 рука + 7 ладонь) — единственное, что может
  // шевельнуться; тело, голова, тень и все цвета остаются неподвижны.
  const figureCount = callsNamed(first, 'createRadialGradient').length / 6;
  assert.ok(figureCount > 0 && Number.isInteger(figureCount), 'целое число фигур');
  const block = first.calls.length / figureCount;
  assert.ok(Number.isInteger(block), 'одинаковый блок вызовов на фигуру');
  const waveStart = block - 25;

  let changed = 0;
  for (let i = 0; i < firstFrame.length; i += 1) {
    const original = firstFrame[i];
    const next = otherFrame[i];
    assert.equal(next.name, original.name);
    if (original.name === 'addColorStop' || original.name === 'fillStyle') {
      assert.deepEqual(next, original, 'цвета не мигают');
    }
    if (i % block < waveStart) {
      assert.deepEqual(next, original, 'статичная часть фигуры от времени не зависит');
    } else if (JSON.stringify(next) !== JSON.stringify(original)) {
      changed += 1;
    }
  }
  assert.ok(changed > 0, 'время действительно меняет позу');
  assert.ok(changed <= figureCount * 10, 'двигается только мягкий хвост фигуры');

  // Взмах плавный: за 40 мс доли пикселя, за 650 мс — заметный сдвиг кисти.
  const handArcXAt = (t) => {
    const ctx = createMockCtx();
    drawFigures(ctx, W, H, 30, t);
    return callsNamed(ctx, 'arc')
      .filter((_, i) => i % 4 === 3)
      .map((arc) => arc.args[0]);
  };
  const at0 = handArcXAt(0);
  const at40 = handArcXAt(40);
  const at650 = handArcXAt(650);
  assert.equal(at0.length, figureCount, 'по одной ладони на фигуру');
  assert.ok(at0.every((x, i) => Math.abs(at40[i] - x) < 2), 'за 40 мс сдвиг крошечный');
  assert.ok(at0.some((x, i) => Math.abs(at650[i] - x) > 0.2), 'за 650 мс взмах заметен');
});
