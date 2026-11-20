// Тесты матрицы I/O story 1.4 «Повторный вход без преград» (см.
// story-repeat-entry-plan.md): флаг "1" → готовый мир с первого кадра,
// касания при revealed — полный no-op, никаких циклов и лишних кадров,
// деградации и синхронная проверка подписи в index.html.
// Без зависимостей: node:test + ручные стабы document/window/localStorage/rAF
// и мок-2D-контекст (образцы — test/ritual.test.js, test/matrix.test.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { bootstrap } from '../src/main.js';
import { createSceneContract } from '../src/contract.js';
import {
  FIRST_VISIT_KEY,
  FIRST_VISIT_VALUE,
  PHASE_DARK,
  PHASE_FALLING,
  PHASE_REVEALED,
} from '../src/ritual.js';
import { registerWorld, WORLD_COLORS } from '../src/world.js';

/** Мок-2D-контекст: фиксирует вызовы отрисовки (как в test/ritual.test.js). */
function createMockCtx() {
  const calls = [];
  const record = (name, ...args) => calls.push({ name, args });
  let globalAlpha = 1;
  return {
    calls,
    beginPath: (...a) => record('beginPath', ...a),
    arc: (...a) => record('arc', ...a),
    arcTo: (...a) => record('arcTo', ...a),
    fill: (...a) => record('fill', ...a),
    fillRect: (...a) => record('fillRect', ...a),
    moveTo: (...a) => record('moveTo', ...a),
    lineTo: (...a) => record('lineTo', ...a),
    quadraticCurveTo: (...a) => record('quadraticCurveTo', ...a),
    closePath: (...a) => record('closePath', ...a),
    stroke: (...a) => record('stroke', ...a),
    createLinearGradient: (...a) => {
      record('createLinearGradient', ...a);
      return { addColorStop: (...s) => record('addColorStop', ...s) };
    },
    createRadialGradient: (...a) => {
      record('createRadialGradient', ...a);
      return { addColorStop: (...s) => record('addColorStop', ...s) };
    },
    get globalAlpha() {
      return globalAlpha;
    },
    set globalAlpha(value) {
      record('globalAlpha', value);
      globalAlpha = value;
    },
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

/** Вызовы кадра начиная с fromIndex (история ctx накапливается). */
function frameCalls(ctx, fromIndex) {
  return ctx.calls.slice(fromIndex);
}

/** Крупные круги 10–30 px — только свечение искры (мир рисует мелкие
 *  снежинки и крупную тень-эллипс ёлки радиуса > 100). */
function sparkArcsIn(calls) {
  return calls.filter((c) => c.name === 'arc' && c.args[2] > 10 && c.args[2] < 30);
}

/**
 * localStorage-стаб с живым значением: setItem реально меняет getItem —
 * два «открытия страницы» делят одно хранилище, как один браузер.
 */
function createSharedStorage(initial = null) {
  let value = initial;
  const writes = [];
  return {
    writes,
    // Только ключ флага: стаб не выдаёт значение по чужому ключу —
    // чтение не того ключа не маскируется.
    getItem: (key) => (key === FIRST_VISIT_KEY ? value : null),
    setItem(key, val) {
      writes.push([key, val]);
      value = val;
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

/** Мир на странице: та же схема, что в src/main.js (регистрация после bootstrap). */
function attachWorld(contract, ritual) {
  registerWorld(contract, (t) => ritual.progress(t));
}

// --- Строка матрицы: «Повторный вход с флагом» -----------------------------

test('repeat: два открытия — первый вход ставит флаг, повторное сразу в готовом мире', () => {
  const storage = createSharedStorage();

  // Сессия 1: чистый браузер, ритуал доигран циклом rAF, флаг записан.
  const h1 = createHarness({ storage });
  const contract1 = createSceneContract();
  const { ritual: ritual1 } = bootstrap(h1.doc, h1.win, contract1);
  attachWorld(contract1, ritual1);

  assert.equal(ritual1.phase, PHASE_DARK, 'первое открытие — темнота');
  assert.equal(h1.elements.caption.hidden, false, 'подпись видна');
  assert.equal(h1.elements.scene.style.cursor, 'pointer', 'тихая affordance в dark');

  h1.setClock(0);
  h1.sceneListeners.pointerdown();
  for (const ms of [500, 1000, 1500, 2000, 2100]) {
    h1.setClock(ms);
    assert.ok(h1.flushFrame(), `кадр на ${ms} мс`);
  }
  assert.equal(ritual1.phase, PHASE_REVEALED, 'первый ритуал доигран');
  assert.deepEqual(
    storage.writes,
    [[FIRST_VISIT_KEY, FIRST_VISIT_VALUE]],
    'флаг "1" записан один раз',
  );

  // Сессия 2: тот же браузер (тот же storage) — «повторное открытие».
  const h2 = createHarness({ storage });
  const contract2 = createSceneContract();
  const page2 = bootstrap(h2.doc, h2.win, contract2);
  attachWorld(contract2, page2.ritual);
  page2.render();

  assert.equal(page2.ritual.phase, PHASE_REVEALED, 'revealed с первого кадра, без касания');
  assert.equal(h2.elements.caption.hidden, true, 'подпись «зажги» не показывается');
  assert.notEqual(h2.elements.scene.style.cursor, 'pointer', 'нет ловушки-курсора');
  assert.equal(h2.rafQueue.length, 0, 'rAF-цикл не запускался');
  assert.equal(storage.writes.length, 1, 'флаг не перезаписывается повторно');

  // Мир синхронно в кадре (без ожидания времени), искры в готовом мире нет.
  assert.ok(
    callsNamed(h2.ctx, 'createLinearGradient').length > 0,
    'мир нарисован сразу, без цикла и действий',
  );
  assert.ok(
    callsNamed(h2.ctx, 'addColorStop').some(
      (c) => c.args[1] === WORLD_COLORS.treeLight,
    ),
    'ёлка в кадре',
  );
  assert.equal(sparkArcsIn(h2.ctx.calls).length, 0, 'искры (свечения) в готовом мире нет');
  assert.equal(h2.elements.fallback.hidden, true, 'заглушка не показана');

  // Касание любым жестом при revealed — полный no-op (см. отдельный тест
  // на счёт вызовов ctx; здесь — состояние страницы).
  for (const type of ['pointerdown', 'touchstart', 'mousedown']) {
    h2.sceneListeners[type]();
    assert.equal(page2.ritual.phase, PHASE_REVEALED, `${type}: фаза не изменилась`);
    assert.equal(h2.rafQueue.length, 0, `${type}: цикл не запущен`);
    assert.equal(storage.writes.length, 1, `${type}: флаг не перезаписан`);
  }

  // Resize с Event-аргументом: кадр с миром, без искры и без цикла.
  const mark = h2.ctx.calls.length;
  h2.winListeners.resize({ type: 'resize' });
  const after = frameCalls(h2.ctx, mark);
  assert.ok(
    after.some((c) => c.name === 'fillRect'),
    'resize-кадр отрисован',
  );
  assert.ok(
    after.some((c) => c.name === 'createLinearGradient'),
    'мир перерисован на новый размер',
  );
  assert.equal(sparkArcsIn(after).length, 0, 'искры нет и после resize');
  assert.equal(h2.rafQueue.length, 0, 'resize не планирует цикл');
  assert.equal(storage.writes.length, 1, 'флаг по-прежнему один');
});

// --- Строка матрицы: «Касание при revealed» --------------------------------

test('repeat: касание/клик/тап при revealed — полный no-op без единого вызова отрисовки', () => {
  for (const type of ['pointerdown', 'touchstart', 'mousedown']) {
    const storage = createSharedStorage(FIRST_VISIT_VALUE);
    const h = createHarness({ storage });
    const contract = createSceneContract();
    const { ritual } = bootstrap(h.doc, h.win, contract);
    attachWorld(contract, ritual);

    const mark = h.ctx.calls.length;
    h.sceneListeners[type]();

    assert.equal(
      h.ctx.calls.length,
      mark,
      `${type}: ни одного вызова отрисовки — нет анимации-сюрприза`,
    );
    assert.equal(ritual.phase, PHASE_REVEALED, `${type}: фаза revealed`);
    assert.equal(ritual.startedAt, 0, `${type}: таймер ритуала не тронут`);
    assert.equal(h.rafQueue.length, 0, `${type}: кадровый цикл не запущен`);
    assert.equal(storage.writes.length, 0, `${type}: запись флага не повторена`);
    assert.equal(h.elements.caption.hidden, true, `${type}: подпись осталась скрытой`);
    assert.deepEqual(h.elements.caption.style, {}, `${type}: подписью не управляют`);
    assert.notEqual(h.elements.scene.style.cursor, 'pointer', `${type}: cursor не меняется`);
  }
});

// --- Строка матрицы: «rAF-цикл при повторном входе» ------------------------

test('repeat: rAF-цикл не запускается — только статичные кадры (bootstrap, регистрация, resize)', () => {
  const storage = createSharedStorage(FIRST_VISIT_VALUE);
  const h = createHarness({ storage });
  const contract = createSceneContract();
  const { render, ritual } = bootstrap(h.doc, h.win, contract);
  attachWorld(contract, ritual);
  render(); // на странице после bootstrap идёт page.render() — тот же тик

  // Каждый render — ровно один fillRect фона; лишних кадров нет.
  // Точный счёт осознанный: при добавлении fillRect-слоёв в эпики 2–4
  // числа обновляются здесь намеренно (маркер — присваивание fillStyle
  // фона в renderFrame), а не тихо.
  assert.equal(callsNamed(h.ctx, 'fillRect').length, 2, 'два статичных кадра: bootstrap + регистрация мира');

  h.sceneListeners.pointerdown();
  h.sceneListeners.mousedown();
  assert.equal(h.rafQueue.length, 0, 'очередь rAF пуста после касаний');
  assert.equal(callsNamed(h.ctx, 'fillRect').length, 2, 'касания не породили кадров');

  h.winListeners.resize({ type: 'resize' });
  assert.equal(callsNamed(h.ctx, 'fillRect').length, 3, 'resize — один статичный кадр');
  assert.equal(h.rafQueue.length, 0, 'цикл так и не запланирован');
  assert.equal(ritual.phase, PHASE_REVEALED, 'фаза не сдвинулась');
});

// --- Строка матрицы: «Деградации при повторном входе» ----------------------

test('repeat: без rAF повторный вход — мир первым кадром, касание no-op, без падения', () => {
  const storage = createSharedStorage(FIRST_VISIT_VALUE);
  const h = createHarness({ storage, raf: false });
  const contract = createSceneContract();
  const { render, ritual } = bootstrap(h.doc, h.win, contract);
  attachWorld(contract, ritual);
  render(); // на странице — page.render() сразу после регистрации мира

  assert.equal(ritual.phase, PHASE_REVEALED, 'revealed без цикла (цикл и не нужен)');
  assert.ok(
    callsNamed(h.ctx, 'createLinearGradient').length > 0,
    'мир нарисован первым кадром',
  );
  assert.equal(sparkArcsIn(h.ctx.calls).length, 0, 'искры нет');
  assert.doesNotThrow(() => h.sceneListeners.pointerdown(), 'касание не падает без rAF');
  assert.equal(h.rafQueue.length, 0, 'очередь пуста');
  assert.equal(storage.writes.length, 0, 'флаг не перезаписывается');
});

test('repeat: без canvas 2D повторный вход — заглушка, подпись скрыта, касание не падает', () => {
  const storage = createSharedStorage(FIRST_VISIT_VALUE);
  const h = createHarness({ storage, hasCanvas2D: false });

  assert.doesNotThrow(() => bootstrap(h.doc, h.win, createSceneContract()), 'bootstrap не падает');
  assert.equal(h.elements.fallback.hidden, false, 'заглушка показана');
  assert.equal(h.elements.scene.hidden, true, 'canvas скрыт');
  assert.equal(h.elements.caption.hidden, true, 'подпись скрыта (флаг + fallback)');
  assert.equal(callsNamed(h.ctx, 'arc').length, 0, 'отрисовки не было');
  assert.doesNotThrow(() => h.sceneListeners.pointerdown(), 'касание при fallback не падает');
  assert.equal(storage.writes.length, 0, 'флаг не перезаписывается');
});

// --- Строка матрицы: «Флага нет / флаг битый» (smoke; строки 1.3) ----------

test('repeat: флага нет или битый — ритуал играется, а не готовый мир', () => {
  for (const storage of [undefined, createSharedStorage(null), createSharedStorage('junk')]) {
    const h = createHarness({ storage });
    const { ritual } = bootstrap(h.doc, h.win, createSceneContract());
    assert.equal(ritual.phase, PHASE_DARK, 'нет валидного флага — первый вход');
    assert.equal(h.elements.caption.hidden, false, 'подпись видна');
    assert.equal(h.elements.scene.style.cursor, 'pointer', 'cursor — affordance ритуала');
    h.sceneListeners.pointerdown();
    assert.equal(ritual.phase, PHASE_FALLING, 'касание запускает ритуал');
    assert.equal(h.rafQueue.length, 1, 'цикл ритуала запущен');
  }
});

// --- Строка матрицы: «Мелькание подписи до модуля» / структура страницы ----

test('repeat: index.html — синхронный инлайн-скрипт прячет подпись до модуля, литералы сверены с ritual.js', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Подпись по умолчанию видна (первый вход — матрица story 1.3).
  assert.match(html, /<p id="caption">зажги<\/p>/, 'разметка подписи не изменилась');
  assert.doesNotMatch(html, /<p id="caption" hidden/, 'подпись не скрыта по умолчанию');

  // Ровно один bare <script> — синхронный (без type/defer/async), внутри
  // <body> после подписи и до отложенного модуля: выполняется при парсинге.
  const bare = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(bare, 'инлайн-скрипт на месте');
  assert.equal(
    (html.match(/<script>/g) || []).length,
    1,
    'ровно один bare-скрипт — второй не подсунулся молча',
  );
  const moduleAt = html.indexOf('<script type="module"');
  assert.ok(moduleAt !== -1, 'модуль-точка входа на месте');
  assert.ok(html.indexOf(bare[0]) < moduleAt, 'скрипт выполняется до загрузки модуля');
  assert.ok(
    html.indexOf('<p id="caption">') < html.indexOf(bare[0]),
    'скрипт идёт после подписи (элемент существует)',
  );

  // Литералы ключа/значения совпадают с константами ритуала — два источника
  // правды склеены тестом. Допуск к пробелам/кавычкам: безобидный
  // реформат инлайн-скрипта не должен ломать тест.
  const literals = new RegExp(
    `getItem\\(\\s*['"]${FIRST_VISIT_KEY}['"]\\s*\\)\\s*===\\s*['"]${FIRST_VISIT_VALUE}['"]`,
  );
  assert.ok(literals.test(bare[1]), 'ключ и значение — из src/ritual.js');

  // Исполняем извлечённый код на стабах document/localStorage.
  const caption = { hidden: false };
  const doc = { getElementById: (id) => (id === 'caption' ? caption : null) };
  const run = (storage) => new Function('document', 'localStorage', bare[1])(doc, storage);

  run({ getItem: () => FIRST_VISIT_VALUE });
  assert.equal(caption.hidden, true, 'флаг "1" → подпись скрыта синхронно, до модуля');

  caption.hidden = false;
  run({ getItem: () => 'junk' });
  assert.equal(caption.hidden, false, 'битый флаг → подпись остаётся (будет ритуал)');

  caption.hidden = false;
  assert.doesNotThrow(
    () => run({ getItem: () => { throw new Error('SecurityError'); } }),
    'бросающее хранилище → не падаем',
  );
  assert.equal(caption.hidden, false, 'ошибка чтения → подпись остаётся');

  // Элемента подписи вовсе нет — guard в скрипте, не падаем.
  assert.doesNotThrow(
    () =>
      new Function('document', 'localStorage', bare[1])(
        { getElementById: () => null },
        { getItem: () => FIRST_VISIT_VALUE },
      ),
    'нет элемента подписи — не падаем',
  );
});
