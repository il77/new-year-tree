// Тесты матрицы I/O story 2 (контракт рендера сцены): регистрация,
// порядок отрисовки, невалидный аргумент. Без зависимостей: node:test
// + ручные стабы document/window/ctx (как в test/matrix.test.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bootstrap, page } from '../src/main.js';
import { renderFrame, BACKGROUND } from '../src/scene.js';
import { createSceneContract, sceneContract, DEFAULT_LAYER } from '../src/contract.js';
import { GLOW_LAYERS } from '../src/spark.js';

/** Мок-2D-контекст: фиксирует вызовы отрисовки (образец — test/spark.test.js).
 *  save/restore/translate/rotate/scale — методы трансформации камеры
 *  (story 1.5): кадр с t > 0 их вызывает; рекордеры добавлены механически,
 *  утверждения тестов не менялись. */
function createMockCtx() {
  const calls = [];
  const record = (name, ...args) => calls.push({ name, args });
  return {
    calls,
    beginPath: (...a) => record('beginPath', ...a),
    arc: (...a) => record('arc', ...a),
    fill: (...a) => record('fill', ...a),
    fillRect: (...a) => record('fillRect', ...a),
    moveTo: (...a) => record('moveTo', ...a),
    lineTo: (...a) => record('lineTo', ...a),
    stroke: (...a) => record('stroke', ...a),
    save: (...a) => record('save', ...a),
    restore: (...a) => record('restore', ...a),
    translate: (...a) => record('translate', ...a),
    rotate: (...a) => record('rotate', ...a),
    scale: (...a) => record('scale', ...a),
    set fillStyle(value) {
      record('fillStyle', value);
    },
    set strokeStyle(value) {
      record('strokeStyle', value);
    },
    set lineWidth(value) {
      record('lineWidth', value);
    },
  };
}

function callsNamed(ctx, name) {
  return ctx.calls.filter((call) => call.name === name);
}

/** Стаб страницы: элементы index.html + окно с ресайз-слушателем. */
function createHarness({ width = 1280, height = 800 } = {}) {
  const ctx = createMockCtx();
  const elements = {
    scene: {
      hidden: false,
      width: 0,
      height: 0,
      getContext: (kind) => (kind === '2d' ? ctx : null),
    },
    caption: { hidden: false },
    fallback: { hidden: true },
  };
  const listeners = {};
  const win = {
    innerWidth: width,
    innerHeight: height,
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
  };
  const doc = {
    getElementById: (id) => elements[id] ?? null,
  };
  return { ctx, elements, listeners, win, doc };
}

// --- Строка матрицы: «Регистрация объекта» --------------------------------

test('contract: регистрация — draw вызывается на следующем кадре с (ctx, width, height, t)', () => {
  const contract = createSceneContract();
  const ctx = createMockCtx();
  const seen = [];

  contract.register((...args) => seen.push(args));
  assert.equal(seen.length, 0, 'до кадра вызовов нет');
  assert.equal(contract.size, 1, 'объект зарегистрирован');

  renderFrame(ctx, 320, 240, 1000, contract);

  assert.equal(seen.length, 1, 'один вызов на кадр');
  const [passedCtx, width, height, t] = seen[0];
  assert.equal(passedCtx, ctx, 'ctx передан как есть');
  assert.equal(width, 320, 'ширина кадра');
  assert.equal(height, 240, 'высота кадра');
  assert.equal(t, 1000, 'время кадра');
});

// --- Строка матрицы: «Кадр с объектом» ------------------------------------

test('contract: кадр с объектом — после фона и искры отрисован и объект, вызовы видны в мок-ctx', () => {
  const contract = createSceneContract();
  const ctx = createMockCtx();
  const OBJECT_COLOR = '#0f0';

  contract.register((c) => {
    c.fillStyle = OBJECT_COLOR;
    c.fillRect(10, 20, 30, 40);
  });
  renderFrame(ctx, 100, 100, 0, contract);

  // Фон — первым: fillStyle '#000' и fillRect на весь кадр.
  assert.equal(callsNamed(ctx, 'fillStyle')[0].args[0], BACKGROUND, 'фон залит чёрным');
  assert.deepEqual(callsNamed(ctx, 'fillRect')[0].args, [0, 0, 100, 100], 'фон покрывает кадр');

  // Искра нарисована (свечение = GLOW_LAYERS кругов)…
  const firstArcIdx = ctx.calls.findIndex((c) => c.name === 'arc');
  assert.ok(firstArcIdx > -1, 'искра нарисована');
  assert.equal(callsNamed(ctx, 'arc').length, GLOW_LAYERS.length + 1, 'только искра, объект кругов не рисовал');

  // …и объект — строго после неё; его вызовы зафиксированы в мок-ctx.
  const objectFillIdx = ctx.calls.findIndex(
    (c) => c.name === 'fillRect' && c.args[0] === 10,
  );
  assert.ok(objectFillIdx > firstArcIdx, 'объект отрисован после искры');
  assert.ok(
    callsNamed(ctx, 'fillStyle').some((c) => c.args[0] === OBJECT_COLOR),
    'вызов объекта виден в мок-ctx',
  );
  assert.deepEqual(
    ctx.calls[objectFillIdx].args,
    [10, 20, 30, 40],
    'объект нарисован своими координатами',
  );
});

// --- Строка матрицы: «Порядок отрисовки» ----------------------------------

test('contract: порядок стабилен — по слою, при равенстве в порядке регистрации; искра раньше всех слоёв', () => {
  const contract = createSceneContract();
  const order = [];

  // Один слой без явного layer: стабильный порядок регистрации.
  contract.register(() => order.push('default-1'));
  contract.register(() => order.push('layer-10-a'), { layer: 10 });
  contract.register(() => order.push('layer--5'), { layer: -5 });
  contract.register(() => order.push('default-2'));
  contract.register(() => order.push('layer-10-b'), { layer: 10 });

  assert.equal(DEFAULT_LAYER, 0, 'слой по умолчанию — 0');

  // Объекты пишут маркеры в мок-ctx, чтобы зафиксировать порядок в кадре.
  const ctx = createMockCtx();
  const markerNames = ['m-default-1', 'm-layer-10-a', 'm-layer--5', 'm-default-2', 'm-layer-10-b'];
  for (const [i, name] of markerNames.entries()) {
    const layer = name.includes('10') ? 10 : name.includes('-5') ? -5 : 0;
    contract.register((c) => c.fillRect(100 + i, 0, 1, 1), { layer });
  }
  renderFrame(ctx, 10, 10, 0, contract);

  assert.deepEqual(
    order,
    ['layer--5', 'default-1', 'default-2', 'layer-10-a', 'layer-10-b'],
    'слой по возрастанию, внутри слоя — порядок регистрации',
  );

  // Искра (arc) идёт раньше любого маркера объекта — слои контракта после искры,
  // включая отрицательные.
  const firstArcIdx = ctx.calls.findIndex((c) => c.name === 'arc');
  const markerIdxs = ctx.calls
    .map((c, i) => (c.name === 'fillRect' && c.args[0] >= 100 ? i : -1))
    .filter((i) => i >= 0);
  assert.ok(markerIdxs.length >= 5, 'маркеры всех пяти объектов в кадре');
  assert.ok(
    markerIdxs.every((i) => i > firstArcIdx),
    'все объекты отрисованы после искры',
  );
});

// --- Строка матрицы: «Регистрация объекта» — невалидный аргумент -----------

test('contract: невалидный аргумент — понятная ошибка, не тихий сбой', () => {
  const contract = createSceneContract();

  assert.throws(() => contract.register(), TypeError, 'без аргумента — TypeError');
  assert.throws(
    () => contract.register(null),
    /draw-функция/,
    'не-функция — понятное сообщение',
  );
  assert.throws(
    () => contract.register('draw'),
    /draw-функция/,
    'строка вместо функции — понятное сообщение',
  );
  assert.throws(
    () => contract.register(() => {}, { layer: 'up' }),
    /layer/,
    'layer не число — понятное сообщение',
  );
  assert.throws(
    () => contract.register(() => {}, { layer: Number.NaN }),
    /layer/,
    'layer NaN — понятное сообщение',
  );
  assert.throws(
    () => contract.register(() => {}, 5),
    /register: options/,
    'options не объект — понятное сообщение',
  );
  assert.throws(
    () => contract.register(() => {}, 'junk'),
    /register: options/,
    'options строка — понятное сообщение',
  );
  assert.throws(
    () => contract.register(() => {}, null),
    /register: options.*null/,
    'options null — ошибка с префиксом register:, а не сырой destructure',
  );

  assert.equal(contract.size, 0, 'ничего не зарегистрировано после ошибок');
  const ctx = createMockCtx();
  assert.doesNotThrow(() => renderFrame(ctx, 10, 10, 0, contract), 'кадр без объектов проходит');
  assert.equal(callsNamed(ctx, 'arc').length, GLOW_LAYERS.length + 1, 'только искра');
});

// --- Приёмка: «тестовый объект добавляется через контракт и отображается» --

test('contract: bootstrap подключает контракт к кадру и ресайзу — объект на экране', () => {
  const h = createHarness();
  const contract = createSceneContract();
  const seen = [];

  contract.register((c, width, height, t) => {
    seen.push([c, width, height, t]);
    c.fillStyle = '#123456';
    c.fillRect(1, 2, 3, 4);
  });

  const result = bootstrap(h.doc, h.win, contract);
  assert.equal(result.contract, contract, 'bootstrap возвращает переданный контракт');
  assert.equal(typeof result.render, 'function', 'render по-прежнему возвращается');

  // Первый кадр: объект отрисован с размерами окна, вызов виден в мок-ctx.
  assert.equal(seen.length, 1, 'объект на первом кадре');
  assert.deepEqual(seen[0].slice(1), [1280, 800, 0], '(ctx, width, height, t) первого кадра');
  const objectFillIdx = h.ctx.calls.findIndex((c) => c.name === 'fillRect' && c.args[0] === 1);
  const firstArcIdx = h.ctx.calls.findIndex((c) => c.name === 'arc');
  assert.ok(objectFillIdx > firstArcIdx, 'объект после искры');
  assert.ok(
    callsNamed(h.ctx, 'fillStyle').some((c) => c.args[0] === '#123456'),
    'вызов объекта виден в мок-ctx',
  );

  // Ресайз: объект перерисован с новыми размерами.
  h.win.innerWidth = 640;
  h.win.innerHeight = 480;
  h.listeners.resize();
  assert.equal(seen.length, 2, 'объект на кадре после ресайза');
  assert.deepEqual(seen[1].slice(1), [640, 480, 0], 'новые размеры кадра');
});

test('contract: bootstrap по умолчанию использует общий sceneContract страницы', () => {
  const h = createHarness();
  const result = bootstrap(h.doc, h.win);
  assert.equal(result.contract, sceneContract, 'без третьего аргумента — общий экземпляр');
  // В тесты в общий экземпляр не регистрируемся — состояние изолировано.
  assert.equal(sceneContract.size, 0, 'общий экземпляр не засорён регистрациями');
});

test('contract: поздняя регистрация — render() показывает объект без ресайза (путь docs/contract.md)', () => {
  // На странице рендер-хэндл — общий `page` из src/main.js; в Node document
  // нет, поэтому page === null, а кадр вызывается тем же render() явно.
  assert.equal(page, null, 'вне браузера page === null (экспорт существует)');

  const h = createHarness();
  const contract = createSceneContract();
  const { render } = bootstrap(h.doc, h.win, contract);

  const isMarker = (c) => c.name === 'fillRect' && c.args[0] === 77;
  assert.equal(h.ctx.calls.filter(isMarker).length, 0, 'до регистрации объекта нет');

  // Регистрация после bootstrap — документированный поздний путь.
  contract.register((c) => c.fillRect(77, 0, 1, 1));
  render(); // без изменения размеров окна

  const markers = h.ctx.calls.filter(isMarker);
  assert.equal(markers.length, 1, 'объект на экране сразу после render(), не дожидаясь ресайза');
  const firstArcIdx = h.ctx.calls.findIndex((c) => c.name === 'arc');
  assert.ok(h.ctx.calls.indexOf(markers[0]) > firstArcIdx, 'объект после искры');
});
