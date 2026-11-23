// Тесты матрицы I/O story 1.3 «Ритуал первого входа» (см. story-ritual-plan.md).
// Без зависимостей: node:test + ручные стабы document/window/localStorage/rAF
// и мок-2D-контекст (образцы — test/matrix.test.js, test/contract.test.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { bootstrap } from '../src/main.js';
import { createSceneContract } from '../src/contract.js';
import { GLOW_LAYERS, SPARK_POSITION } from '../src/spark.js';
import {
  createRitual,
  startRitual,
  updateRitual,
  ritualProgress,
  readFirstVisit,
  writeFirstVisit,
  FIRST_VISIT_KEY,
  FIRST_VISIT_VALUE,
  PHASE_DARK,
  PHASE_FALLING,
  PHASE_REVEALED,
  RITUAL_TIMING,
  RITUAL_TOTAL,
  SPARK_FALL_TO_RATIO,
} from '../src/ritual.js';
import {
  registerWorld,
  LAYER_SNOW,
  LAYER_FOREST,
  LAYER_TREE,
  WORLD_COLORS,
} from '../src/world.js';
import { createMockCtx, callsNamed, frameCalls, sparkArcsIn } from '../scripts/mock-ctx.js';

/** Близость числа (координаты с плавающей точкой). */
function approx(actual, expected, eps = 0.5, label = '') {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `${label}ожидалось ≈${expected}, получено ${actual}`,
  );
}

/** Цвета всех градиентных стопов кадра (туда объекты мира кладут свои цвета). */
function stopColors(ctx) {
  return callsNamed(ctx, 'addColorStop').map((c) => c.args[1]);
}

/** localStorage-стаб: значение, запись-счётчик, опциональные исключения. */
function createStorage({ value = null, readThrows = false, writeThrows = false } = {}) {
  const writes = [];
  return {
    writes,
    getItem() {
      if (readThrows) throw new Error('SecurityError: getItem denied');
      return value;
    },
    setItem(key, val) {
      if (writeThrows) throw new Error('SecurityError: setItem denied');
      writes.push([key, val]);
    },
  };
}

/**
 * Стаб страницы: элементы index.html + окно с rAF-очередью, управляемыми
 * часами performance.now, слушателями касаний на canvas и ресайза на окне.
 */
function createHarness({
  storage,
  hasCanvas2D = true,
  width = 1280,
  height = 800,
  raf = true,
} = {}) {
  const ctx = createMockCtx();
  const sceneListeners = {};
  const winListeners = {};
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
    addEventListener: (type, fn) => {
      winListeners[type] = fn;
    },
  };
  if (storage) win.localStorage = storage;
  if (raf) {
    win.requestAnimationFrame = (fn) => {
      rafQueue.push(fn);
      return rafQueue.length;
    };
  }
  win.performance = { now: () => clock };

  const doc = {
    getElementById: (id) => elements[id] ?? null,
  };

  return {
    ctx,
    elements,
    sceneListeners,
    winListeners,
    rafQueue,
    doc,
    win,
    setClock: (ms) => {
      clock = ms;
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

/** Мир + журнал прогресса: та же схема, что на странице (регистрация после bootstrap). */
function attachWorld(contract, ritual) {
  const log = [];
  registerWorld(contract, (t) => {
    const p = ritual.progress(t);
    log.push({ t, p });
    return p;
  });
  return log;
}

// --- Строка матрицы: «Первый вход без флага» -------------------------------

test('ritual: первый вход без флага — тёмный кадр с искрой, мир не показан, подпись видна', () => {
  const h = createHarness();
  const contract = createSceneContract();
  const { ritual } = bootstrap(h.doc, h.win, contract);
  const log = attachWorld(contract, ritual);
  // Слушатель получает Event, а не число (как в браузере) — кадр обязан
  // отбрасывать нечисловой t, иначе NaN в свечении искры.
  h.winListeners.resize({ type: 'resize' });

  assert.equal(ritual.phase, PHASE_DARK, 'фаза — темнота до касания');
  assert.ok(log.length > 0, 'прогресс мира запрашивался на кадре');

  // Фон чёрный на весь кадр, искра в центре-выше.
  assert.equal(callsNamed(h.ctx, 'fillStyle')[0].args[0], '#000', 'фон залит чёрным');
  assert.deepEqual(callsNamed(h.ctx, 'fillRect')[0].args, [0, 0, 1280, 800]);
  const firstArc = sparkArcsIn(h.ctx.calls)[0];
  assert.ok(firstArc, 'искра нарисована');
  approx(firstArc.args[0], 1280 * SPARK_POSITION.xRatio, 1e-9, 'x искры: ');
  approx(firstArc.args[1], 800 * SPARK_POSITION.yRatio, 1e-9, 'y искры: ');
  assert.ok(firstArc.args[1] < 400, 'икриса выше центра');

  // Мир не показан: объекты мира рисуются только через градиенты.
  assert.equal(callsNamed(h.ctx, 'createLinearGradient').length, 0, 'нет слоёв мира');
  assert.equal(callsNamed(h.ctx, 'createRadialGradient').length, 0, 'нет снежинок и бликов');
  assert.ok(
    GLOW_LAYERS.every((l) =>
      callsNamed(h.ctx, 'fillStyle').some((c) => c.args[0] === l.color),
    ),
    'свечение искры на месте',
  );

  // Подпись «зажги» видна, заглушка — нет, тёмная страница кликабельна.
  assert.equal(h.elements.caption.hidden, false, 'подпись видна');
  assert.equal(h.elements.fallback.hidden, true, 'заглушка не показана');
  assert.equal(h.elements.scene.style.cursor, 'pointer', 'тихая affordance: указатель');
});

// --- Строка матрицы: «Касание» ---------------------------------------------

test('ritual: касание запускает ритуал — pointerdown/touchstart/mousedown, идемпотентно', () => {
  for (const type of ['pointerdown', 'touchstart', 'mousedown']) {
    const h = createHarness();
    h.setClock(5000);
    const contract = createSceneContract();
    const { ritual } = bootstrap(h.doc, h.win, contract);

    assert.equal(typeof h.sceneListeners[type], 'function', `${type} подключён`);
    // До касания цикла нет: тёмная фаза статична (анимировать нечего),
    // касание — единственный её триггер (живая сцена 1.5 стартует со сценой).
    assert.equal(h.rafQueue.length, 0, 'до касания очередь rAF пуста');
    h.sceneListeners[type]();

    assert.equal(ritual.phase, PHASE_FALLING, `${type}: фаза falling`);
    assert.equal(ritual.startedAt, 5000, 'старт — от текущего времени');
    assert.equal(h.elements.caption.style.opacity, '0', 'подпись тихо гаснет (fade)');
    assert.equal(h.elements.scene.style.cursor, '', 'ловушка-курсор снята');
    assert.equal(h.rafQueue.length, 1, 'запущен кадровый цикл');

    // Повторное касание — no-op, старт не сдвигается.
    h.setClock(7000);
    h.sceneListeners[type]();
    assert.equal(ritual.phase, PHASE_FALLING, 'фаза не изменилась');
    assert.equal(ritual.startedAt, 5000, 'таймер не сдвинулся');
    assert.equal(h.rafQueue.length, 1, 'второй цикл не запущен');
  }
});

// --- Строка матрицы: «Проявление по шагам времени» -------------------------

test('ritual: по шагам времени — искра падает и гаснет, снег → лес → ёлка проявляются плавно', () => {
  const h = createHarness();
  const contract = createSceneContract();
  const { render, ritual } = bootstrap(h.doc, h.win, contract);
  const log = attachWorld(contract, ritual);

  ritual.touch(1000);
  const at = (t) => log.filter((entry) => entry.t === t).at(-1).p;

  // t=1000 (старт): темнота, искра на месте.
  let mark = h.ctx.calls.length;
  render(1000);
  assert.deepEqual(at(1000).layers, { snow: 0, forest: 0, tree: 0 }, 'мир ещё не начался');
  const startArc = sparkArcsIn(frameCalls(h.ctx, mark)).at(-1);
  approx(startArc.args[1], 800 * SPARK_POSITION.yRatio, 1e-9, 'икриса в старте: ');

  // t=1400 (e=400): падение на середине (ease-in), только снег проступает.
  mark = h.ctx.calls.length;
  render(1400);
  const p400 = at(1400);
  assert.ok(p400.layers.snow > 0, 'снег проявился');
  assert.equal(p400.layers.forest, 0, 'лес ещё спит (задержка 650 мс)');
  assert.equal(p400.layers.tree, 0, 'ёлки ещё нет (задержка 1100 мс)');
  assert.ok(p400.spark.yRatio > SPARK_POSITION.yRatio, 'искра падает');
  approx(p400.spark.yRatio, 0.51, 0.01, 'половина ease-in пути: ');
  const midCalls = frameCalls(h.ctx, mark);
  const midArc = sparkArcsIn(midCalls).at(-1);
  approx(midArc.args[1], p400.spark.yRatio * 800, 1e-9, 'arc в позиции прогресса: ');
  assert.ok(
    midCalls.some((c) => c.name === 'createRadialGradient'),
    'снежинки мира появились в кадре',
  );

  // t=1700 (e=700): искра тает (последние 30% падения), лес начал проступать.
  mark = h.ctx.calls.length;
  render(1700);
  const p700 = at(1700);
  assert.ok(p700.layers.forest > 0, 'лес проявился');
  assert.equal(p700.layers.tree, 0, 'ёлки ещё нет');
  assert.ok(p700.spark.alpha < 1 && p700.spark.alpha > 0, 'альфа искры между 0 и 1');
  // Альфа искры на 700/800 пути: (1 - fall) / 0.3 (последние 30% падения).
  const expectedAlpha = (1 - (700 / RITUAL_TIMING.fall)) / 0.3;
  assert.ok(
    frameCalls(h.ctx, mark).some(
      (c) => c.name === 'globalAlpha' && Math.abs(c.args[0] - expectedAlpha) < 1e-9,
    ),
    `альфа ${expectedAlpha} передана в контекст`,
  );
  // Восстановление альфы проверяется на кадре БЕЗ контракта: слои мира
  // восстанавливают globalAlpha сами и замазали бы поломку drawSpark.
  const bare = createHarness();
  const bareBootstrap = bootstrap(bare.doc, bare.win, createSceneContract());
  bareBootstrap.ritual.touch(1000);
  bareBootstrap.render(1700);
  assert.equal(
    callsNamed(bare.ctx, 'globalAlpha').at(-1).args[0],
    1,
    'альфа восстановлена к концу кадра (кадр без контракта)',
  );

  // t=1900 (e=900): падение кончилось — искры нет вовсе; ёлки ещё нет.
  mark = h.ctx.calls.length;
  render(1900);
  assert.equal(sparkArcsIn(frameCalls(h.ctx, mark)).length, 0, 'икриса погасла у земли');
  assert.equal(at(1900).layers.tree, 0, 'ёлка стартует позже');

  // t=2300 (e=1300): ёлка проявилась, снег дозрел.
  render(2300);
  const p1300 = at(2300);
  assert.ok(p1300.layers.tree > 0, 'ёлка проявилась');
  assert.equal(p1300.layers.snow, 1, 'снег дозрел');

  // Монотонность и порядок слоёв: снег впереди леса, лес — впереди ёлки.
  assert.ok(at(1400).layers.snow < at(1900).layers.snow, 'снег растёт');
  assert.ok(at(1700).layers.snow > at(1700).layers.forest, 'снег впереди леса');
  assert.ok(at(2300).layers.forest > at(2300).layers.tree, 'лес впереди ёлки');

  // Граница: полный ритуал → revealed, мир целиком, искры нет.
  assert.equal(ritual.update(3050), PHASE_REVEALED, 'RITUAL_TOTAL → revealed');
  const done = ritual.progress(3050);
  assert.deepEqual(done.layers, { snow: 1, forest: 1, tree: 1 }, 'мир полностью проявился');
  assert.equal(done.spark.alpha, 0, 'искры больше нет');
});

// --- Строка матрицы: «Флаг есть» -------------------------------------------

test('ritual: флаг "1" — сразу готовый мир, ритуал не играется, касания игнорируются', () => {
  const storage = createStorage({ value: FIRST_VISIT_VALUE });
  const h = createHarness({ storage });
  const contract = createSceneContract();
  const { ritual } = bootstrap(h.doc, h.win, contract);
  attachWorld(contract, ritual);
  h.winListeners.resize({ type: 'resize' }); // кадр с миром, аргумент — Event

  assert.equal(ritual.phase, PHASE_REVEALED, 'сразу revealed, без касания');
  assert.ok(
    callsNamed(h.ctx, 'createLinearGradient').length > 0,
    'мир нарисован с первого кадра',
  );
  assert.equal(sparkArcsIn(h.ctx.calls).length, 0, 'искры в готовом мире нет');
  assert.equal(h.elements.caption.hidden, true, 'подпись «зажги» не показывается');
  assert.notEqual(h.elements.scene.style.cursor, 'pointer', 'нет ловушки-курсора');

  // Касание — no-op: ритуал не стартует, кадров не прибавляется.
  // Семантика 1.4/1.3 сохранена сравнением очереди: цикл живой сцены
  // (story 1.5) bootstrap уже запустил для revealed — касание не должен
  // ни остановить его, ни породить второй.
  const queueBeforeTouch = h.rafQueue.length;
  assert.equal(queueBeforeTouch, 1, 'цикл живой сцены запущен с bootstrap');
  h.sceneListeners.pointerdown();
  assert.equal(ritual.phase, PHASE_REVEALED, 'фаза не изменилась');
  assert.equal(
    h.rafQueue.length,
    queueBeforeTouch,
    'касание не добавило кадров — цикл не перезапущен',
  );
  assert.equal(storage.writes.length, 0, 'флаг не перезаписывается');
});

// --- Строка матрицы: «Битый флаг» ------------------------------------------

test('ritual: битый/чужой флаг — не падает, ведёт себя как первый вход', () => {
  for (const value of ['junk', '', '0', 'true', '1 ']) {
    const storage = createStorage({ value });
    const h = createHarness({ storage });
    const contract = createSceneContract();
    let ritual;
    assert.doesNotThrow(() => {
      ({ ritual } = bootstrap(h.doc, h.win, contract));
    }, `bootstrap не падает при флаге ${JSON.stringify(value)}`);
    assert.equal(ritual.phase, PHASE_DARK, `флаг ${JSON.stringify(value)} — первый вход`);
    ritual.touch(100);
    assert.equal(ritual.phase, PHASE_FALLING, 'ритуал запускается');
    // После ритуала битое значение заменяется каноническим "1".
    writeFirstVisit(storage);
    assert.deepEqual(storage.writes.at(-1), [FIRST_VISIT_KEY, FIRST_VISIT_VALUE]);
  }
});

// --- Строка матрицы: «localStorage бросает» --------------------------------

test('ritual: localStorage бросает — как первый вход каждый раз, ритуал доигрывается без падения', () => {
  const storage = createStorage({ readThrows: true, writeThrows: true });
  const h = createHarness({ storage });
  const contract = createSceneContract();

  let result;
  assert.doesNotThrow(() => {
    result = bootstrap(h.doc, h.win, contract);
  }, 'bootstrap не падает при бросающем хранилище');
  const { ritual } = result;
  attachWorld(contract, ritual);

  assert.equal(ritual.phase, PHASE_DARK, 'ошибка чтения = «первого входа не было»');
  assert.equal(h.elements.caption.hidden, false, 'подпись видна');

  // Полный прогон через rAF-цикл: кадры идут, финал достижим.
  h.setClock(0);
  h.sceneListeners.pointerdown();
  for (const ms of [500, 1000, 1500, 2000, 2100]) {
    h.setClock(ms);
    assert.ok(h.flushFrame(), `кадр на ${ms} мс`);
  }

  assert.equal(ritual.phase, PHASE_REVEALED, 'ритуал доигран');
  assert.equal(h.elements.caption.hidden, true, 'подпись скрыта по финалу');
  assert.equal(h.rafQueue.length, 1, 'на revealed цикл продолжается — живая сцена (1.5)');
  assert.ok(
    callsNamed(h.ctx, 'createLinearGradient').length > 0,
    'мир проявился в кадре',
  );
  assert.equal(storage.writes.length, 0, 'ошибка записи проглочена, падения нет');
});

// --- Строка матрицы: «Завершение ритуала» (рабочее хранилище) ---------------

test('ritual: флаг записан циклом rAF с рабочим хранилищем — не вручную', () => {
  const storage = createStorage({ value: null });
  const h = createHarness({ storage });
  const contract = createSceneContract();
  const { ritual } = bootstrap(h.doc, h.win, contract);
  attachWorld(contract, ritual);

  // Полный прогон: касание → кадры до revealed → флаг ставит finishRitual.
  h.setClock(0);
  h.sceneListeners.pointerdown();
  for (const ms of [500, 1000, 1500, 2000, 2100]) {
    h.setClock(ms);
    assert.ok(h.flushFrame(), `кадр на ${ms} мс`);
  }

  assert.equal(ritual.phase, PHASE_REVEALED, 'ритуал доигран циклом');
  assert.equal(h.rafQueue.length, 1, 'на revealed цикл продолжается — живая сцена (1.5)');
  assert.deepEqual(
    storage.writes,
    [[FIRST_VISIT_KEY, FIRST_VISIT_VALUE]],
    'флаг записан именно циклом, ровно один раз',
  );
});

// --- Строка матрицы: «Нет canvas 2D» ---------------------------------------

test('ritual: нет canvas 2D + бросающий localStorage — fallback как раньше, без падения', () => {
  const storage = createStorage({ readThrows: true, writeThrows: true });
  const h = createHarness({ storage, hasCanvas2D: false });

  assert.doesNotThrow(() => bootstrap(h.doc, h.win), 'bootstrap не падает');
  assert.equal(h.elements.fallback.hidden, false, 'заглушка показана');
  assert.equal(h.elements.scene.hidden, true, 'canvas скрыт');
  assert.equal(h.elements.caption.hidden, true, 'подпись скрыта');
  assert.equal(callsNamed(h.ctx, 'arc').length, 0, 'отрисовки не было');
  // Касание по скрытому canvas безопасно (guard на заглушку).
  assert.doesNotThrow(() => h.sceneListeners.pointerdown(), 'касание при fallback не падает');
});

// --- Строка матрицы: «Нет requestAnimationFrame» ---------------------------

test('ritual: нет rAF — касание проявляет мир мгновенно и ставит флаг, без падения', () => {
  const storage = createStorage({ value: null });
  const h = createHarness({ storage, raf: false });
  const contract = createSceneContract();
  const { ritual } = bootstrap(h.doc, h.win, contract);
  attachWorld(contract, ritual);

  assert.doesNotThrow(() => h.sceneListeners.pointerdown(), 'касание не падает без rAF');
  assert.equal(ritual.phase, PHASE_REVEALED, 'мир проявился мгновенно (деградация)');
  assert.equal(h.elements.caption.hidden, true, 'подпись скрыта');
  assert.deepEqual(storage.writes, [[FIRST_VISIT_KEY, FIRST_VISIT_VALUE]], 'флаг записан');
  assert.ok(
    callsNamed(h.ctx, 'createLinearGradient').length > 0,
    'мир нарисован сразу после касания',
  );
});

// --- Строка матрицы: «Ресайз окна» во время ритуала -----------------------

test('ritual: ресайз во время ритуала — кадр берёт текущее время, мир не откатывается', () => {
  const h = createHarness();
  const contract = createSceneContract();
  const { ritual } = bootstrap(h.doc, h.win, contract);
  const log = attachWorld(contract, ritual);

  ritual.touch(1000);
  h.setClock(1600); // e = 600 мс: снег уже проявился
  h.winListeners.resize({ type: 'resize' }); // реальный слушатель шлёт Event

  const last = log.at(-1);
  assert.ok(last, 'resize-кадр прошёл через прогресс');
  assert.equal(last.t, 1600, 'кадр взял now(), а не 0');
  assert.ok(last.p.layers.snow > 0, 'снег не откатился в 0');
  assert.equal(h.elements.scene.width, 1280, 'canvas растянут');
});

// --- Строка матрицы: «Регистрация мира» -----------------------------------

test('ritual: registerWorld — три объекта слоями, порядок снег → лес → ёлка, гирлянда выше', () => {
  // Гейтинг: включён только снег — рисуется только снег.
  const gated = createSceneContract();
  registerWorld(gated, () => ({ layers: { snow: 0.5, forest: 0, tree: 0 } }));
  assert.equal(gated.size, 3, 'три объекта мира');
  const ctxOnlySnow = createMockCtx();
  gated.draw(ctxOnlySnow, 100, 100, 0);
  const snowStops = stopColors(ctxOnlySnow);
  assert.ok(snowStops.length > 0, 'снег нарисован (градиентные стопы есть)');
  assert.ok(snowStops.includes(WORLD_COLORS.snowLight), 'стоп снега на месте');
  assert.equal(snowStops.includes(WORLD_COLORS.forestLight), false, 'лес не рисовался');
  assert.equal(snowStops.includes(WORLD_COLORS.treeLight), false, 'ёлка не рисовалась');

  // Слои координируются с эпиками: снег → лес → ёлка < гирлянда (20).
  assert.ok(LAYER_SNOW < LAYER_FOREST, 'снег ниже леса');
  assert.ok(LAYER_FOREST < LAYER_TREE, 'лес ниже ёлки');
  assert.ok(LAYER_TREE < 20, 'ёлка ниже будущей гирлянды (слой 20 epic-garland)');

  // Все слои включены (первый вход уже сыгран) — порядок кадра строго
  // снег → лес → ёлка по возрастанию layer.
  const ctx = createMockCtx();
  const ritualAll = createRitual({ firstVisit: true });
  const contractAll = createSceneContract();
  registerWorld(contractAll, (t) => ritualAll.progress(t));
  contractAll.draw(ctx, 1280, 800, 0);
  const styles = stopColors(ctx);
  const idx = (color) => styles.indexOf(color);
  assert.ok(idx(WORLD_COLORS.snowLight) !== -1, 'снег в кадре');
  assert.ok(idx(WORLD_COLORS.forestLight) !== -1, 'лес в кадре');
  assert.ok(idx(WORLD_COLORS.treeLight) !== -1, 'ёлка в кадре');
  assert.ok(
    idx(WORLD_COLORS.snowLight) < idx(WORLD_COLORS.forestLight) &&
      idx(WORLD_COLORS.forestLight) < idx(WORLD_COLORS.treeLight),
    'порядок кадра: снег → лес → ёлка',
  );
});

// --- Чистое ядро: детерминизм и границы машины состояний -------------------

test('ritual: чистые функции — детерминированы по t, границы переходов точны', () => {
  // Детерминизм: одинаковые аргументы → глубоко одинаковый результат.
  const falling = { phase: PHASE_FALLING, startedAt: 1000 };
  assert.deepEqual(ritualProgress(falling, 1500), ritualProgress(falling, 1500), 'детерминирован');
  assert.deepEqual(
    ritualProgress(falling, 999),
    ritualProgress(falling, 500),
    'время до старта клампится в 0',
  );

  // Старт — только из dark.
  const dark = { phase: PHASE_DARK, startedAt: null };
  assert.deepEqual(startRitual(dark, 42), { phase: PHASE_FALLING, startedAt: 42 });
  assert.equal(startRitual(dark, Number.NaN), dark, 'нечисловой старт — no-op');
  const tracked = createRitual();
  assert.equal(tracked.touch(Number.NaN), false, 'нечисловое касание не запускает ритуал');
  assert.equal(tracked.phase, PHASE_DARK, 'фаза не сдвинулась');
  assert.equal(startRitual(falling, 42), falling, 'из falling старт невозможен');
  const revealed = { phase: PHASE_REVEALED, startedAt: 0 };
  assert.equal(startRitual(revealed, 42), revealed, 'из revealed старт невозможен');

  // Граница перехода: RITUAL_TOTAL включительно.
  assert.equal(
    updateRitual(falling, 1000 + RITUAL_TOTAL - 1).phase,
    PHASE_FALLING,
    'за 1 мс до финала — ещё falling',
  );
  assert.equal(
    updateRitual(falling, 1000 + RITUAL_TOTAL).phase,
    PHASE_REVEALED,
    'на финале — revealed',
  );
  assert.equal(updateRitual(revealed, 99999), revealed, 'revealed терминален');
  assert.equal(updateRitual(dark, 99999), dark, 'dark не переходит без старта');

  // Фаза dark: искра на месте, мира нет.
  const p = ritualProgress(dark, 777);
  assert.deepEqual(p.layers, { snow: 0, forest: 0, tree: 0 });
  assert.equal(p.spark.yRatio, SPARK_POSITION.yRatio);
  assert.equal(p.spark.alpha, 1);

  // Тайминг из плана: падение 700–900 мс, полный ритуал 1.5–2.5 с,
  // порядок проявления слоёв снег → лес → ёлка.
  assert.ok(RITUAL_TIMING.fall >= 700 && RITUAL_TIMING.fall <= 900, 'падение 700–900 мс');
  assert.ok(RITUAL_TOTAL >= 1500 && RITUAL_TOTAL <= 2500, 'проявление 1.5–2.5 с');
  assert.ok(RITUAL_TIMING.snowDelay < RITUAL_TIMING.forestDelay, 'снег раньше леса');
  assert.ok(RITUAL_TIMING.forestDelay < RITUAL_TIMING.treeDelay, 'лес раньше ёлки');
  assert.equal(SPARK_FALL_TO_RATIO, 0.78, 'иксра падает на кромку снега');

  // Контроллер: firstVisit → revealed; finish() дожимает falling.
  assert.equal(createRitual({ firstVisit: true }).phase, PHASE_REVEALED, 'флаг = сразу мир');
  const mid = createRitual();
  mid.touch(0);
  assert.equal(mid.phase, PHASE_FALLING);
  mid.finish();
  assert.equal(mid.phase, PHASE_REVEALED, 'finish() — деградация без rAF');
});

// --- Флаг localStorage: обе ветки try/catch --------------------------------

test('ritual: readFirstVisit/writeFirstVisit — «1» пропускает, остальное и ошибки — первый вход', () => {
  // Обычные ветки.
  assert.equal(readFirstVisit(null), false, 'нет хранилища — первый вход');
  assert.equal(readFirstVisit(undefined), false, 'undefined — первый вход');
  assert.equal(readFirstVisit(createStorage({ value: '1' })), true, '"1" — ритуал сыгран');
  assert.equal(readFirstVisit(createStorage({ value: 'junk' })), false, 'битое значение');
  assert.equal(readFirstVisit(createStorage({ value: '' })), false, 'пустое значение');
  assert.equal(readFirstVisit(createStorage({ value: '0' })), false, 'ложный флаг');
  assert.equal(readFirstVisit(createStorage({ value: null })), false, 'нет ключа');

  // Бросающее хранилище: чтение и запись не падают.
  const throwing = createStorage({ readThrows: true, writeThrows: true });
  assert.equal(readFirstVisit(throwing), false, 'ошибка чтения — не падаем');
  assert.doesNotThrow(() => writeFirstVisit(throwing), 'ошибка записи — не падаем');
  assert.doesNotThrow(() => writeFirstVisit(null), 'null — не падаем');

  // Успешная запись — ровно ключ/значение, которые читает story 1.4.
  const good = createStorage();
  writeFirstVisit(good);
  assert.deepEqual(good.writes, [[FIRST_VISIT_KEY, FIRST_VISIT_VALUE]], 'флаг записан как "1"');
  assert.equal(FIRST_VISIT_KEY, 'ny_tree_first_visit', 'ключ флага из плана');
});

// --- Строка матрицы: «Структура страницы» (ритуал) -------------------------

test('ritual: структура index.html — тихий fade подписи, touch-action, без модалок и звуков', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Подпись гаснет плавно (transition), а не исчезает мгновенно.
  assert.match(html, /#caption[\s\S]*?transition: opacity 700ms ease/, 'fade подписи объявлен');
  // Тап — жест ритуала, а не жест браузера.
  assert.match(html, /#scene[\s\S]*?touch-action: none/, 'touch-action на canvas');
  // Тихий вход: ни модалок, ни звуков, ни диалогов.
  assert.doesNotMatch(
    html,
    /<dialog|<audio|<video|alert\(|confirm\(|prompt\(/,
    'без преград внимания',
  );
});
