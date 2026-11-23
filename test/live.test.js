// Тесты матрицы I/O story 1.5 «Живая сцена» (см. story-live-scene-plan.md):
// чистое ядро анимации (камера, падение снега, мерцание) детерминировано
// по t, статичный кадр остаётся без transform, rAF-цикл один и не
// останавливается на revealed, скрытая вкладка ставит цикл на паузу,
// деградации (нет rAF / нет 2D) — без анимации, но как раньше.
// Без зависимостей: node:test + ручные стабы document/window/localStorage/rAF
// и мок-2D-контекст (образцы — test/ritual.test.js, test/repeat.test.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bootstrap } from '../src/main.js';
import { renderFrame, CONTENT_OVERSCAN } from '../src/scene.js';
import { createSceneContract } from '../src/contract.js';
import {
  cameraAt,
  isCameraNeutral,
  CAMERA,
  SNOW_BAND,
  flakeState,
  twinkleAt,
} from '../src/animation.js';
import {
  createRitual,
  FIRST_VISIT_KEY,
  FIRST_VISIT_VALUE,
  PHASE_DARK,
  PHASE_FALLING,
  PHASE_REVEALED,
} from '../src/ritual.js';
import { registerWorld, drawTree, FLAKES, TREE_LIGHTS, WORLD_COLORS } from '../src/world.js';
import {
  createMockCtx,
  callsNamed,
  sparkArcsIn,
  backgroundRectsIn,
} from '../scripts/mock-ctx.js';

/** Методы трансформации камеры — проверяются по отдельности. */
const TRANSFORM_CALLS = ['save', 'translate', 'rotate', 'scale', 'restore'];

/** localStorage-стаб с живым значением (образец — test/repeat.test.js). */
function createSharedStorage(initial = null) {
  let value = initial;
  const writes = [];
  return {
    writes,
    getItem: (key) => (key === FIRST_VISIT_KEY ? value : null),
    setItem(key, val) {
      writes.push([key, val]);
      value = val;
    },
  };
}

/**
 * Стаб страницы: элементы index.html + окно с rAF-очередью, управляемыми
 * часами performance.now; doc умеет visibilitychange (docEvents — guard-ветка
 * «у стаба нет addEventListener» проверяется тем же переключателем).
 */
function createHarness({
  storage,
  hasCanvas2D = true,
  width = 1280,
  height = 800,
  raf = true,
  docEvents = true,
  winEvents = true,
  hiddenProp = true,
  hasPerformance = true,
} = {}) {
  const ctx = createMockCtx();
  const sceneListeners = {};
  const winListeners = {};
  const docListeners = {};
  const rafQueue = [];
  let clock = 0;

  const elements = {
    scene: {
      hidden: false,
      width: 0,
      height: 0,
      style: {},
      getContext: (kind) => (hasCanvas2D && kind === '2d' ? ctx : null),
      addEventListener: (type, fn) => {
        sceneListeners[type] = fn;
      },
    },
    caption: { hidden: false, style: {} },
    fallback: { hidden: true },
  };

  const win = {
    innerWidth: width,
    innerHeight: height,
  };
  // winEvents: false — стаб без Window.addEventListener (guard-ветка).
  if (winEvents) {
    win.addEventListener = (type, fn) => {
      winListeners[type] = fn;
    };
  }
  if (storage) win.localStorage = storage;
  if (raf) {
    win.requestAnimationFrame = (fn) => {
      rafQueue.push(fn);
      return rafQueue.length;
    };
  }
  // hasPerformance: false — стаб без win.performance: bootstrap должен
  // упасть на фолбэк Date.now() (проверяется подставленными часами).
  if (hasPerformance) win.performance = { now: () => clock };

  const doc = {
    getElementById: (id) => elements[id] ?? null,
  };
  // hiddenProp: false — стаб без Document.hidden (guard pageIsHidden).
  if (hiddenProp) doc.hidden = false;
  if (docEvents) {
    doc.addEventListener = (type, fn) => {
      docListeners[type] = fn;
    };
  }

  return {
    ctx,
    elements,
    sceneListeners,
    winListeners,
    docListeners,
    rafQueue,
    doc,
    win,
    setClock: (ms) => {
      clock = ms;
    },
    setHidden(value) {
      doc.hidden = value;
    },
    /** Событие visibilitychange; false — слушателя нет (guard-стаб). */
    dispatchVisibility() {
      const fn = docListeners.visibilitychange;
      if (!fn) return false;
      fn();
      return true;
    },
    /** Запускает один queued-кадр rAF; false — очередь пуста. */
    flushFrame() {
      const fn = rafQueue.shift();
      if (!fn) return false;
      fn();
      return true;
    },
  };
}

/** Мир на странице: та же схема, что в src/main.js. */
function attachWorld(contract, ritual) {
  registerWorld(contract, (t) => ritual.progress(t));
}

// --- Чистое ядро: камера ----------------------------------------------------

test('live: камера — чистая функция: t=0 нейтральна, амплитуды мягкие, детерминирована', () => {
  // Статичный кадр (t = 0 по контракту) — камера в нуле: путь без transform.
  assert.ok(isCameraNeutral(cameraAt(0)), 't=0 — камера нейтральна');
  assert.ok(isCameraNeutral(cameraAt(Number.NaN)), 'нечисловое t — как статичный кадр');
  assert.deepEqual(cameraAt(7000), cameraAt(7000), 'детерминирована по t');

  const mid = cameraAt(2750); // четверть периода сдвига — ближе к максимуму
  assert.ok(!isCameraNeutral(mid), 't>0 — камера в движении');
  // Мягкость (R10/R11: «слегка покачивается»): движения ограничены
  // константами CAMERA — заметны, но не укачивают и не рвут ритуал.
  assert.ok(Math.abs(mid.dxRatio) <= CAMERA.swayRatio, 'горизонталь ≤ 0.22% ширины');
  assert.ok(Math.abs(mid.dyRatio) <= CAMERA.driftRatio, 'вертикаль ≤ 0.15% высоты');
  assert.ok(Math.abs(mid.rotation) <= CAMERA.tiltRad, 'поворот ≤ 0.0028 рад (≈0.16°)');
  assert.ok(Math.abs(mid.scale - 1) <= CAMERA.breatheScale, 'масштаб ±0.6%');
  // Бюджет мягкости закреплён литералами требования, а не только константами:
  // поднятие амплитуды в CAMERA не должно молча проходить тест.
  assert.equal(CAMERA.swayRatio, 0.0022, 'горизонталь — 0.22% ширины (R10)');
  assert.equal(CAMERA.driftRatio, 0.0015, 'вертикаль — 0.15% высоты (R10)');
  assert.equal(CAMERA.tiltRad, 0.0028, 'поворот — 0.0028 рад (R10)');
  assert.equal(CAMERA.breatheScale, 0.006, 'масштаб — ±0.6% (R10)');

  // Разные t — разные состояния: движение зависит только от времени.
  assert.notDeepEqual(cameraAt(3000), cameraAt(9000), 'камера качается по времени');
});

// --- Чистое ядро: снег ------------------------------------------------------

test('live: снежинка — падает по t, заворачивается в полосе, качается и мерцаёт мягко', () => {
  const flake = FLAKES[0];
  const start = flakeState(flake, 0);
  // Статичный кадр не меняется: t=0 → исходная позиция «рассыпа».
  assert.equal(start.yRatio, flake.yRatio, 't=0 — исходная yRatio');
  assert.ok(Math.abs(start.xRatio - flake.xRatio) <= flake.swayAmp, 'качка ≤ swayAmp');
  assert.ok(start.alpha >= 0.78 && start.alpha <= 1, 'мерцание в мягких пределах (без стробоскопа)');

  // Падение: через 1 с y вырос (вниз). Запас до низа полосы у всех
  // снежинок больше, чем за 1 с — wrap тут не срабатывает.
  const later = flakeState(flake, 1000);
  assert.ok(later.yRatio > start.yRatio, 'снежинка падает вниз');

  // Wrap: через много периодов — снова внутри полосы (снег бесконечен).
  for (const big of [flake.fallPeriod * 3.5, 1e7]) {
    const s = flakeState(flake, big);
    assert.ok(
      s.yRatio >= SNOW_BAND.top && s.yRatio <= SNOW_BAND.bottom,
      `y внутри полосы при t=${big}`,
    );
    assert.ok(Math.abs(s.xRatio - flake.xRatio) <= flake.swayAmp, 'x внутри ±swayAmp');
    assert.ok(s.alpha >= 0.78 && s.alpha <= 1, 'альфа в пределах мерцания');
  }

  // Time-based: одинаковые t → одинаковое состояние; никакого счётчика кадров.
  assert.deepEqual(flakeState(flake, 12345), flakeState(flake, 12345), 'детерминирована');
  assert.notDeepEqual(flakeState(flake, 0), flakeState(flake, 12345), 'зависит только от t');

  // Мерцание — мягкий сдвиг синуса в [0, 1].
  assert.ok(twinkleAt(0, 5000, 0) >= 0 && twinkleAt(0, 5000, 0) <= 1, 'twinkleAt ∈ [0, 1]');
});

// --- Кадр: статичный без transform, живой — с камерой ------------------------

test('live: renderFrame — t=0 без transform (старый статичный кадр), t>0 камера применяется', () => {
  const contract = createSceneContract();
  contract.register(() => {});
  const cameraExpected = cameraAt(5000);

  // Статичный кадр: ни одного вызова трансформации — поведение 1.3/1.4.
  const still = createMockCtx();
  renderFrame(still, 320, 240, 0, contract);
  for (const name of TRANSFORM_CALLS) {
    assert.equal(callsNamed(still, name).length, 0, `t=0: ${name} не вызывается`);
  }

  // Живой кадр: save → translate к центру со сдвигом камеры → rotate →
  // scale → … → restore вокруг искры и объектов контракта.
  const moving = createMockCtx();
  renderFrame(moving, 320, 240, 5000, contract);
  for (const name of TRANSFORM_CALLS) {
    assert.ok(callsNamed(moving, name).length > 0, `t>0: есть ${name}`);
  }
  const [firstTranslate] = callsNamed(moving, 'translate');
  assert.deepEqual(
    firstTranslate.args,
    [
      160 + cameraExpected.dxRatio * 320,
      120 + cameraExpected.dyRatio * 240,
    ],
    'translate ведёт центр кадра к смещению камеры',
  );
  const [rotation] = callsNamed(moving, 'rotate');
  assert.ok(Math.abs(rotation.args[0]) > 0, 'rotate ненулевой (сцена покачивается)');
  assert.equal(rotation.args[0], cameraExpected.rotation, 'поворот — из cameraAt(t)');
  const [scaleCall] = callsNamed(moving, 'scale');
  assert.notEqual(scaleCall.args[0], 1, 'масштаб «дышит»');
  assert.equal(
    scaleCall.args[0],
    cameraExpected.scale * CONTENT_OVERSCAN,
    'масштаб = дыхание камеры × страховочный запас (нет чёрных полос у края)',
  );
  // Запас покрывает худшее «втягивание» края: (1 − scale) + сдвиг + поворот.
  const worstPull =
    (1 - (1 - CAMERA.breatheScale)) * 400 + CAMERA.driftRatio * 800 + Math.sin(CAMERA.tiltRad) * 640;
  assert.ok(
    (CONTENT_OVERSCAN - 1) * 400 > worstPull,
    'запас overscan больше худшего отъезда края по вертикали',
  );
});

test('live: камера — четыре угла контента вне видимой области по фактическим transform-вызовам', () => {
  const width = 1280;
  const height = 800;
  const corners = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ];

  // Canvas умножает CTM справа: translate → rotate → scale → translate
  // применяются к точке в ОБРАТНОМ порядке (последний вызов — первый шаг).
  const screenPoint = (calls, [x, y]) => {
    for (let i = calls.length - 1; i >= 0; i -= 1) {
      const call = calls[i];
      if (call.name === 'translate') {
        x += call.args[0];
        y += call.args[1];
      } else if (call.name === 'rotate') {
        const angle = call.args[0];
        [x, y] = [
          x * Math.cos(angle) - y * Math.sin(angle),
          x * Math.sin(angle) + y * Math.cos(angle),
        ];
      } else if (call.name === 'scale') {
        x *= call.args[0];
        y *= call.args[1];
      }
    }
    return { x, y };
  };

  // Несколько разных t: сдвиг/поворот/дыхание входят в разные фазы синусов.
  for (const t of [1375, 2750, 5500, 8250, 11000, 15500, 23250]) {
    const ctx = createMockCtx();
    const contract = createSceneContract();
    contract.register(() => {});
    renderFrame(ctx, width, height, t, contract);

    const transforms = ctx.calls.filter((call) =>
      call.name === 'translate' || call.name === 'rotate' || call.name === 'scale',
    );
    assert.deepEqual(
      transforms.map((call) => call.name),
      ['translate', 'rotate', 'scale', 'translate'],
      `t=${t}: последовательность трансформаций камеры`,
    );
    const camera = cameraAt(t);
    assert.deepEqual(
      transforms[0].args,
      [width / 2 + camera.dxRatio * width, height / 2 + camera.dyRatio * height],
      `t=${t}: первый translate — из cameraAt(t)`,
    );
    assert.equal(transforms[1].args[0], camera.rotation, `t=${t}: поворот из cameraAt(t)`);
    assert.equal(
      transforms[2].args[0],
      camera.scale * CONTENT_OVERSCAN,
      `t=${t}: масштаб с запасом overscan`,
    );
    assert.deepEqual(transforms[3].args, [-width / 2, -height / 2], `t=${t}: возврат к центру`);

    for (const corner of corners) {
      const screen = screenPoint(transforms, corner);
      assert.ok(
        screen.x < 0 || screen.x > width || screen.y < 0 || screen.y > height,
        `t=${t}: угол (${corner.join(', ')}) за пределами кадра, а не внутри: ${screen.x.toFixed(1)}, ${screen.y.toFixed(1)}`,
      );
    }
  }
});

test('live: порядок кадра — фон по цвету, save до искры/контракта, restore после', () => {
  const ctx = createMockCtx();
  const contract = createSceneContract();
  let contractDrawAt = -1;
  contract.register((c) => {
    contractDrawAt = c.calls.length;
    c.beginPath();
  }, { layer: 20 });

  renderFrame(ctx, 1280, 800, 4000, contract);
  const calls = ctx.calls;
  const background = backgroundRectsIn(calls);
  assert.equal(background.length, 1, 'ровно один фон, опознанный по цвету');
  assert.deepEqual(background[0].args, [0, 0, 1280, 800], 'фон на весь кадр');

  const indicesOf = (name) => calls.flatMap((call, i) => (call.name === name ? [i] : []));
  const [saveAt] = indicesOf('save');
  const [restoreAt] = indicesOf('restore');
  const spark = sparkArcsIn(calls)[0];
  assert.equal(indicesOf('save').length, 1, 'один save на кадр');
  assert.equal(indicesOf('restore').length, 1, 'один restore на кадр');
  assert.ok(spark, 'искра нарисована');
  const sparkAt = calls.indexOf(spark);
  assert.ok(calls.indexOf(background[0]) < saveAt, 'фон залит до save');
  assert.ok(saveAt < sparkAt, 'save предшествует искре');
  assert.ok(saveAt < contractDrawAt, 'save предшествует объекту контракта');
  assert.ok(contractDrawAt < restoreAt, 'объект контракта нарисован до restore');
  assert.ok(sparkAt < restoreAt, 'искра нарисована до restore');
});

test('live: без win.performance — камера и ритуал идут по подставленному Date.now()', () => {
  const h = createHarness({ storage: createSharedStorage(null), hasPerformance: false });
  assert.equal(h.win.performance, undefined, 'стаб действительно без performance');
  const contract = createSceneContract();
  const realNow = Date.now;
  let stubbedNow = 0;
  Date.now = () => stubbedNow;
  try {
    const { ritual } = bootstrap(h.doc, h.win, contract);
    assert.equal(ritual.phase, PHASE_DARK, 'первый вход — темнота');

    stubbedNow = 1000;
    h.sceneListeners.pointerdown();
    assert.equal(ritual.startedAt, 1000, 'ритуал стартовал по Date.now()');
    assert.equal(h.rafQueue.length, 1, 'цикл запущен');

    stubbedNow = 1500;
    const mark = h.ctx.calls.length;
    assert.ok(h.flushFrame(), 'кадр по подставленному времени');
    const frame = h.ctx.calls.slice(mark);
    const [cameraTranslate] = frame.filter((call) => call.name === 'translate');
    const camera = cameraAt(1500);
    assert.deepEqual(
      cameraTranslate.args,
      [640 + camera.dxRatio * 1280, 400 + camera.dyRatio * 800],
      'камера кадра использует Date.now()',
    );
    assert.equal(ritual.phase, PHASE_FALLING, 'ритуал идёт по Date.now()');
    const [spark] = sparkArcsIn(frame);
    assert.ok(spark, 'искра в кадре');
    assert.equal(spark.args[0], 640, 'искра по центру горизонтали');
    assert.equal(
      spark.args[1],
      ritual.progress(1500).spark.yRatio * 800,
      'искра использует прогресс ритуала от Date.now()',
    );
  } finally {
    Date.now = realNow;
  }
});

// --- Единый цикл: повторный вход --------------------------------------------

test('live: повторный вход — один rAF-цикл, кадры идут, движение меняется, касания ничего не добавляют', () => {
  const storage = createSharedStorage(FIRST_VISIT_VALUE);
  const h = createHarness({ storage });
  const contract = createSceneContract();
  const { ritual } = bootstrap(h.doc, h.win, contract);
  attachWorld(contract, ritual);

  assert.equal(ritual.phase, PHASE_REVEALED, 'повторный вход — мир сразу');
  assert.equal(h.elements.caption.hidden, true, 'подпись скрыта');
  assert.equal(h.rafQueue.length, 1, 'ровно один цикл живой сцены с bootstrap');
  assert.equal(storage.writes.length, 0, 'кадры не пишут стоящий флаг');

  const fillRects = () => callsNamed(h.ctx, 'fillRect').length;
  const base = fillRects();

  // Три кадра с растущим временем: каждый flush перепланирует ровно один
  // следующий — цикл не размножается (нет второго цикла).
  const frames = [];
  let mark = h.ctx.calls.length;
  for (const ms of [10000, 10040, 10080]) {
    h.setClock(ms);
    assert.ok(h.flushFrame(), `кадр на ${ms} мс`);
    assert.equal(h.rafQueue.length, 1, `после кадра ${ms} — снова ровно один pending`);
    frames.push(h.ctx.calls.slice(mark));
    mark = h.ctx.calls.length;
  }
  assert.equal(fillRects(), base + 3, 'каждый кадр цикла нарисован');

  // Снег упал: позиции снежинок в кадре изменились (падение и качка —
  // time-based, см. unit-тест flakeState про направление).
  const flakeArcY = (frame) => frame.filter((c) => c.name === 'arc' && c.args[2] < 6).map((c) => c.args[1]);
  assert.ok(flakeArcY(frames[0]).length > 0, 'снежинки в кадре');
  assert.notDeepEqual(flakeArcY(frames[0]), flakeArcY(frames[2]), 'снег сдвинулся за 80 мс');

  // Камера покачивается: transform-вызовы разных кадров различны.
  const translates = (frame) => frame.filter((c) => c.name === 'translate').map((c) => c.args);
  assert.notDeepEqual(translates(frames[0]), translates(frames[1]), 'камера меняется между кадрами');

  // Касания и resize не добавляют кадров в цикл (семантика 1.4 сохранена).
  const queueAfterStart = h.rafQueue.length;
  for (const type of ['pointerdown', 'touchstart', 'mousedown']) {
    h.sceneListeners[type]();
    assert.equal(h.rafQueue.length, queueAfterStart, `${type}: кадров не прибавилось`);
  }
  assert.equal(fillRects(), base + 3, 'касания не нарисовали ни кадра');
  h.winListeners.resize({ type: 'resize' });
  assert.equal(fillRects(), base + 4, 'resize — ровно один кадр');
  assert.equal(h.rafQueue.length, queueAfterStart, 'resize цикл не удвоил');
  assert.equal(ritual.phase, PHASE_REVEALED, 'фаза не сдвинулась');
  // Хранилище стартует уже с флагом (как после сессии 1.4), но без единой
  // записи: кадры живой сцены флаг не перезаписывают.
  assert.equal(storage.writes.length, 0, 'флаг не тронут: кадры ничего не пишут');
});

// --- Единый цикл: первый вход ------------------------------------------------

test('live: первый вход — цикл доигрывает ритуал и НЕ останавливается на revealed; флаг один раз', () => {
  const storage = createSharedStorage(null);
  const h = createHarness({ storage });
  const contract = createSceneContract();
  const { ritual } = bootstrap(h.doc, h.win, contract);
  attachWorld(contract, ritual);

  assert.equal(ritual.phase, PHASE_DARK, 'первый вход — темнота');
  assert.equal(h.rafQueue.length, 0, 'тёмная фаза статична: анимировать нечего, цикла нет');

  h.setClock(0);
  h.sceneListeners.pointerdown();
  assert.equal(ritual.phase, PHASE_FALLING, 'касание запускает ритуал');
  assert.equal(h.rafQueue.length, 1, 'касание запустило ровно один цикл');

  // Ритуал тем же циклом, что и живая сцена (тайминги RITUAL_TIMING не тронуты).
  for (const ms of [500, 1000, 1500, 2000, 2100]) {
    h.setClock(ms);
    assert.ok(h.flushFrame(), `кадр на ${ms} мс`);
  }
  assert.equal(ritual.phase, PHASE_REVEALED, 'ритуал доигран циклом');
  assert.equal(h.elements.caption.hidden, true, 'подпись скрыта по финалу');
  assert.deepEqual(
    storage.writes,
    [[FIRST_VISIT_KEY, FIRST_VISIT_VALUE]],
    'флаг записан ровно один раз — цикл не перезаписывает',
  );

  // Главное отличие 1.5: на revealed цикл продолжается — движение не
  // останавливается, пока открыта страница.
  assert.equal(h.rafQueue.length, 1, 'на revealed цикл продолжается');
  const before = callsNamed(h.ctx, 'fillRect').length;
  for (const ms of [2500, 3000]) {
    h.setClock(ms);
    assert.ok(h.flushFrame(), `кадр после ритуала на ${ms} мс`);
  }
  assert.equal(callsNamed(h.ctx, 'fillRect').length, before + 2, 'живая сцена продолжает кадры');
  assert.equal(storage.writes.length, 1, 'флаг не перезаписан последующими кадрами');
  assert.equal(h.rafQueue.length, 1, 'по-прежнему ровно один цикл');

  // Касание после revealed — no-op и для цикла, и для флага.
  h.sceneListeners.pointerdown();
  assert.equal(h.rafQueue.length, 1, 'касание не добавило циклов');
  assert.equal(storage.writes.length, 1, 'касание не тронуло флаг');
});

test('live: исключение в кадре не роняет цикл — следующий кадр запланирован один раз', () => {
  const storage = createSharedStorage(FIRST_VISIT_VALUE);
  const h = createHarness({ storage });
  const contract = createSceneContract();
  bootstrap(h.doc, h.win, contract);

  let draws = 0;
  contract.register(() => {
    draws += 1;
    if (draws === 1) throw new Error('плохой объект контракта');
  }, { layer: 99 });

  assert.equal(h.rafQueue.length, 1, 'цикл запущен');
  // t=4000 — камера не нейтральна, поэтому кадр держит открытый save().
  h.setClock(4000);
  const saves = () => callsNamed(h.ctx, 'save').length;
  const restores = () => callsNamed(h.ctx, 'restore').length;
  assert.doesNotThrow(() => h.flushFrame(), 'ошибка кадра не уходит наружу');
  assert.equal(draws, 1, 'первый кадр попробовал нарисоваться');
  assert.equal(saves(), restores(), 'после ошибки save() закрыт restore()');
  assert.equal(h.rafQueue.length, 1, 'после ошибки ровно один следующий кадр');
  h.setClock(4040);
  assert.doesNotThrow(() => h.flushFrame(), 'следующий кадр выполняется');
  assert.equal(draws, 2, 'цикл продолжился');
  assert.equal(saves(), restores(), 'следующий кадр не накопил трансформацию');
  assert.equal(h.rafQueue.length, 1, 'второй цикла не появилось');
  assert.equal(storage.writes.length, 0, 'стоящий флаг не перезаписан');
});

// --- Вкладка: пауза и возобновление ------------------------------------------

test('live: скрытая вкладка останавливает цикл, видимая возобновляет; стабы без событий не падают', () => {
  const storage = createSharedStorage(FIRST_VISIT_VALUE);
  const h = createHarness({ storage });
  bootstrap(h.doc, h.win, createSceneContract());
  assert.equal(h.rafQueue.length, 1, 'цикл запущен');
  assert.equal(typeof h.docListeners.visibilitychange, 'function', 'слушатель подключён');

  // Скрыли вкладку: ближайший кадр видит hidden и не перепланируется —
  // цикл встаёт (экономия CPU), возобновления при скрытой вкладке нет.
  h.setHidden(true);
  assert.ok(h.flushFrame(), 'pending-кадр ещё был в очереди');
  assert.equal(h.rafQueue.length, 0, 'скрытая вкладка: цикл остановился');
  h.dispatchVisibility();
  assert.equal(h.rafQueue.length, 0, 'скрытая: возобновления нет');

  // Вернулись: ровно один цикл, не два.
  h.setHidden(false);
  h.dispatchVisibility();
  assert.equal(h.rafQueue.length, 1, 'видимая: цикл возобновлён (и по-прежнему один)');

  // Тёмная фаза: возврат с вкладки не порождает анимацию статичной темноты.
  const dark = createHarness({});
  bootstrap(dark.doc, dark.win, createSceneContract());
  assert.equal(dark.rafQueue.length, 0, 'dark: цикла нет');
  dark.setHidden(true);
  dark.dispatchVisibility();
  dark.setHidden(false);
  dark.dispatchVisibility();
  assert.equal(dark.rafQueue.length, 0, 'dark: visibilitychange не запускает цикл');

  // Guard: doc без addEventListener — bootstrap не падает (старые стабы 1.3/1.4).
  const plain = createHarness({ storage, docEvents: false });
  assert.doesNotThrow(
    () => bootstrap(plain.doc, plain.win, createSceneContract()),
    'doc без addEventListener — не падаем',
  );

  // Guard: doc без свойства hidden — pageIsHidden() не считает вкладку скрытой,
  // цикл живёт (проверка `=== true`, а не истинности undefined).
  const noHidden = createHarness({ storage, hiddenProp: false });
  bootstrap(noHidden.doc, noHidden.win, createSceneContract());
  assert.equal(noHidden.rafQueue.length, 1, 'без doc.hidden цикл не глохнет');
  assert.ok(noHidden.flushFrame(), 'кадр рисуется');
  assert.equal(noHidden.rafQueue.length, 1, 'цикл продолжается без doc.hidden');
});

// --- Деградации --------------------------------------------------------------

test('live: деградации — без rAF и без canvas 2D живой сцены нет, остальное работает как раньше', () => {
  // Повторный вход без rAF: мир первым кадром, цикла нет.
  const noRaf = createHarness({ storage: createSharedStorage(FIRST_VISIT_VALUE), raf: false });
  const contractA = createSceneContract();
  const { ritual: ritualA, render: renderA } = bootstrap(noRaf.doc, noRaf.win, contractA);
  attachWorld(contractA, ritualA);
  renderA(); // на странице после bootstrap идёт page.render() — мир в первом кадре
  assert.equal(noRaf.rafQueue.length, 0, 'rAF нет — кадров нет');
  assert.equal(ritualA.phase, PHASE_REVEALED, 'мир и так готов');
  assert.ok(
    callsNamed(noRaf.ctx, 'createLinearGradient').length > 0,
    'мир нарисован первым кадром (снег в кадре — градиенты есть)',
  );

  // Первый вход без rAF: прежняя мгновенная деградация (строки 1.3/1.4).
  const darkStorage = createSharedStorage(null);
  const noRafDark = createHarness({ raf: false, storage: darkStorage });
  const contractB = createSceneContract();
  const { ritual: ritualB } = bootstrap(noRafDark.doc, noRafDark.win, contractB);
  attachWorld(contractB, ritualB);
  assert.doesNotThrow(() => noRafDark.sceneListeners.pointerdown(), 'касание не падает');
  assert.equal(ritualB.phase, PHASE_REVEALED, 'мир проявился мгновенно, флаг — тем же путём');
  assert.deepEqual(
    darkStorage.writes,
    [[FIRST_VISIT_KEY, FIRST_VISIT_VALUE]],
    'флаг записан без rAF',
  );

  // rAF есть, а 2D нет: цикл не планируется — анимировать нечего.
  const no2d = createHarness({
    storage: createSharedStorage(FIRST_VISIT_VALUE),
    hasCanvas2D: false,
  });
  bootstrap(no2d.doc, no2d.win, createSceneContract());
  assert.equal(no2d.rafQueue.length, 0, 'без 2D цикл не стартует');
  assert.equal(no2d.elements.fallback.hidden, false, 'заглушка как раньше');

  // Guard: Window без addEventListener — bootstrap не падает (finding 10).
  const noWinEvents = createHarness({
    storage: createSharedStorage(FIRST_VISIT_VALUE),
    winEvents: false,
  });
  assert.doesNotThrow(
    () => bootstrap(noWinEvents.doc, noWinEvents.win, createSceneContract()),
    'окно без addEventListener — не падаем',
  );

  // Guard: документ без caption/fallback — деградация не падает (finding 11).
  const noCaption = createHarness({
    storage: createSharedStorage(FIRST_VISIT_VALUE),
    hasCanvas2D: false,
  });
  const sceneOnly = noCaption.elements.scene;
  noCaption.doc.getElementById = (id) => (id === 'scene' ? sceneOnly : null);
  assert.doesNotThrow(
    () => bootstrap(noCaption.doc, noCaption.win, createSceneContract()),
    'нет caption/fallback — заглушка всё равно показывается',
  );
});

test('live: альфа сбрасывается в начале каждого кадра, даже после плохого объекта', () => {
  const ctx = createMockCtx();
  const contract = createSceneContract();
  contract.register((c) => {
    c.globalAlpha = 0.25;
  }, { layer: 99 });
  const ritual = createRitual({ firstVisit: true });

  for (let frame = 0; frame < 2; frame += 1) {
    const mark = ctx.calls.length;
    renderFrame(ctx, 1280, 800, 4000, contract, ritual);
    const calls = ctx.calls.slice(mark);
    assert.equal(calls[0].name, 'globalAlpha', 'сброс альфы — первый вызов кадра');
    assert.equal(calls[0].args[0], 1, 'альфа сброшена до фона');
    assert.ok(
      calls.findIndex((call) => call.name === 'fillRect') > 0,
      'фон закрашен после сброса',
    );
  }
});

// --- Мерцание мира: детерминизм по t -----------------------------------------

test('live: мир мерцаёт — кадр детерминирован по t и меняется со временем', () => {
  const ritual = createRitual({ firstVisit: true });
  const makeFrame = (t) => {
    const ctx = createMockCtx();
    const contract = createSceneContract();
    registerWorld(contract, (tt) => ritual.progress(tt));
    renderFrame(ctx, 1280, 800, t, contract, ritual);
    return ctx.calls;
  };
  // Градиенты в args — свежие объекты с новой функцией addColorStop в каждом
  // кадре: deepEqual свёл бы их по ссылке. Сами стопы уже записаны отдельными
  // вызовами addColorStop, поэтому объект заменяем маркером — для
  // детерминизма важны координаты/цвета/порядок, а не идентичность обёртки.
  const comparable = (calls) =>
    calls.map((c) => ({
      name: c.name,
      args: c.args.map((arg) => (arg !== null && typeof arg === 'object' ? '<gradient>' : arg)),
    }));

  const at4000 = makeFrame(4000);
  assert.deepEqual(comparable(at4000), comparable(makeFrame(4000)), 'одинаковые t → одинаковый кадр (детерминизм)');

  const at4400 = makeFrame(4400);
  assert.notDeepEqual(comparable(at4000), comparable(at4400), 'разные t → разные позиции/альфы: мир живёт');
  const alphas = (calls) => calls.filter((c) => c.name === 'globalAlpha').map((c) => c.args[0]);
  assert.notDeepEqual(alphas(at4000), alphas(at4400), 'мерцание меняет альфы между кадрами');

  // Огоньки ёлки и снежинки: в кадре без искры (revealed) нет ни одной дуги
  // в диапазоне фильтра «свечение искры» (10 < r < 30) — фильтр старых
  // тестов не захватит огоньки. Проверка честная: если радиус ореола вырастет
  // до 15 px, дуга попадёт в диапазон и тест упадёт (а не выпадет из выборки).
  const sparkBandArcs = at4000.filter(
    (c) => c.name === 'arc' && c.args[2] > 10 && c.args[2] < 30,
  );
  assert.equal(sparkBandArcs.length, 0, 'нет дуг в диапазоне свечения искры (10 < r < 30)');
  // Геометрия огоньков сама по себе: самый большой ореол ≤ 10 px.
  assert.ok(
    Math.max(...TREE_LIGHTS.map((light) => light.r * 4)) <= 10,
    'ореолы огоньков ≤ 10 px по построению',
  );
  // Ёлка с огоньками в кадре (свет тёплый, ядро '#fff7e2').
  assert.ok(
    at4000.some((c) => c.name === 'addColorStop' && c.args[1] === '#fff7e2'),
    'огоньки ёлки нарисованы',
  );
  assert.ok(
    at4000.some((c) => c.name === 'addColorStop' && c.args[1] === WORLD_COLORS.treeLight),
    'ёлка в кадре',
  );

  // Огоньки не гаснут и не мигают стробоскопом: альфа каждого в [0.35, 0.95]
  // (R10). Считаем на прямом вызове drawTree: первая/последняя альфа — слоя.
  const treeCtx = createMockCtx();
  drawTree(treeCtx, 1280, 800, 1, 4000);
  const lightAlphas = treeCtx.calls
    .filter((c) => c.name === 'globalAlpha' && c.args[0] !== 1)
    .map((c) => c.args[0]);
  assert.equal(lightAlphas.length, TREE_LIGHTS.length, 'по альфе на каждый огонёк');
  for (const a of lightAlphas) {
    assert.ok(a >= 0.35 && a <= 0.95, `альфа огонька ${a} в мягком диапазоне [0.35, 0.95]`);
  }
});
