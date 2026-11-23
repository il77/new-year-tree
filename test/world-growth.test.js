// Мир вокруг ёлки (epic-world, story tracer): пороги, города, машущие фигуры
// и регистрация двух слоёв (6 и 9). Тесты чистые — node:test + общий мок ctx
// из scripts/mock-ctx.js, без jsdom, зависимостей и живого времени.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMockCtx, callsNamed } from '../scripts/mock-ctx.js';
import {
  WORLD_GROWTH_COLORS,
  WORLD_GROWTH_LAYERS,
  WORLD_GROWTH_THRESHOLDS,
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

test('setCount клампит счётчик, хэндл только для чтения, регистрация ровно двух объектов', () => {
  const { handle, registrations, draws } = trackingContract();
  assert.equal(registrations.length, 2, 'третьего объекта нет');
  assert.deepEqual(
    registrations.map((registration) => registration.options.layer),
    [WORLD_GROWTH_LAYERS.cities, WORLD_GROWTH_LAYERS.figures],
  );
  assert.deepEqual(
    registrations.map((registration) => registration.options.layer),
    [6, 9],
    'города под лесом (8), фигуры над лесом, но под ёлкой (10)',
  );

  assert.equal(handle.count, 0);
  assert.equal(handle.isUnlocked('cities'), false);
  handle.setCount(12.9);
  assert.equal(handle.count, 12, 'дробный счётчик округляется вниз');
  assert.equal(handle.isUnlocked('cities'), true);
  assert.equal(handle.isUnlocked('figures'), false);

  // Один setCount питает оба объекта: при 12 виден только город.
  const cities12 = createMockCtx();
  const figures12 = createMockCtx();
  draws[0](cities12, W, H, 0);
  draws[1](figures12, W, H, 0);
  assert.ok(cities12.calls.length > 0, 'города при 12 уже нарисованы');
  assert.equal(figures12.calls.length, 0, 'фигуры при 12 ещё спят');

  for (const bad of [-5, NaN, Infinity, -Infinity, undefined, null]) {
    handle.setCount(bad);
    assert.equal(handle.count, 0, `${String(bad)} → 0`);
  }
  handle.setCount(30);
  assert.equal(handle.isUnlocked('figures'), true);
  assert.equal(handle.isUnlocked('beam'), false);

  // Тот же хэндл и тот же счётчик открыли второй слой без новой регистрации.
  const cities30 = createMockCtx();
  const figures30 = createMockCtx();
  draws[0](cities30, W, H, 0);
  draws[1](figures30, W, H, 0);
  assert.ok(cities30.calls.length > 0, 'города остались при 30');
  assert.ok(figures30.calls.length > 0, 'фигуры появились из того же setCount');
  assert.throws(() => {
    handle.count = 999;
  }, TypeError, 'count доступен только на чтение');
});

test('тёмная фаза гасит оба слоя; частичное проявление рисует оба', () => {
  const dark = trackingContract(() => ({ layers: { tree: 0 } }));
  dark.handle.setCount(30);
  const darkCities = createMockCtx();
  const darkFigures = createMockCtx();
  dark.draws[0](darkCities, W, H, 1000);
  dark.draws[1](darkFigures, W, H, 1000);
  assert.equal(darkCities.calls.length, 0, 'пока ёлки нет — городов нет');
  assert.equal(darkFigures.calls.length, 0, 'пока ёлки нет — фигур нет');

  const growing = trackingContract(() => ({ layers: { tree: 0.4 } }));
  growing.handle.setCount(30);
  const partialCities = createMockCtx();
  const partialFigures = createMockCtx();
  growing.draws[0](partialCities, W, H, 1000);
  growing.draws[1](partialFigures, W, H, 1000);
  assert.ok(partialCities.calls.length > 0, 'при частичном проявлении города видны');
  assert.ok(partialFigures.calls.length > 0, 'при частичном проявлении фигуры видны');

  const plain = trackingContract();
  plain.handle.setCount(30);
  const alwaysCities = createMockCtx();
  const alwaysFigures = createMockCtx();
  plain.draws[0](alwaysCities, W, H, 0);
  plain.draws[1](alwaysFigures, W, H, 0);
  assert.ok(alwaysCities.calls.length > 0, 'без progressAt города рисуются всегда');
  assert.ok(alwaysFigures.calls.length > 0, 'без progressAt фигуры рисуются всегда');
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
