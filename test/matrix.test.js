// Тесты матрицы I/O & Edge-Case Matrix плана story-scaffold-plan.md.
// Без зависимостей: node:test + ручные стабы document/window/ctx (без jsdom).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { bootstrap } from '../src/main.js';
import { sparkAt, BACKGROUND } from '../src/scene.js';
import { createMockCtx, callsNamed } from '../scripts/mock-ctx.js';

/** Стаб страницы: элементы index.html + окно с ресайз-слушателем. */
function createHarness({ hasCanvas2D = true, width = 1280, height = 800 } = {}) {
  const ctx = createMockCtx();
  const elements = {
    scene: {
      hidden: false,
      width: 0,
      height: 0,
      getContext: (kind) => (hasCanvas2D && kind === '2d' ? ctx : null),
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

// --- Строка матрицы: «Первый рендер» -------------------------------------

test('matrix: Первый рендер — чёрный фон, искра в центре-выше, подпись «зажги» видна', () => {
  const h = createHarness();
  bootstrap(h.doc, h.win);

  // Canvas растянут на окно.
  assert.equal(h.elements.scene.width, 1280);
  assert.equal(h.elements.scene.height, 800);

  // Чёрный фон покрывает весь кадр.
  assert.ok(
    callsNamed(h.ctx, 'fillStyle').some((c) => c.args[0] === BACKGROUND),
    'фон залит чёрным',
  );
  assert.deepEqual(callsNamed(h.ctx, 'fillRect')[0].args, [0, 0, 1280, 800]);

  // Искра в центре-выше: x = центр, y = 0.42 высоты < половины.
  const firstArc = callsNamed(h.ctx, 'arc')[0];
  assert.ok(firstArc, 'икриса нарисована');
  assert.equal(firstArc.args[0], 1280 * 0.5, 'икриса по центру по горизонтали');
  assert.equal(firstArc.args[1], 800 * 0.42, 'икриса выше центра по вертикали');
  assert.ok(firstArc.args[1] < 800 / 2, 'y искры меньше половины высоты');

  // Подпись видна, заглушка — нет.
  assert.equal(h.elements.caption.hidden, false, 'подпись «зажги» не скрыта');
  assert.equal(h.elements.fallback.hidden, true, 'заглушка не показана');
});

// --- Строка матрицы: «Ресайз окна» ---------------------------------------

test('matrix: Ресайз окна — canvas растягивается, искра остаётся на пропорциональном месте', () => {
  const h = createHarness({ width: 1280, height: 800 });
  bootstrap(h.doc, h.win);

  const before = callsNamed(h.ctx, 'arc')[0].args;
  const ratioBefore = { x: before[0] / 1280, y: before[1] / 800 };

  h.win.innerWidth = 640;
  h.win.innerHeight = 480;
  assert.equal(typeof h.listeners.resize, 'function', 'resize-обработчик подключён');
  h.listeners.resize();

  // Canvas растянулся под новое окно, фон покрывает новый размер.
  assert.equal(h.elements.scene.width, 640, 'canvas по ширине окна');
  assert.equal(h.elements.scene.height, 480, 'canvas по высоте окна');
  const fillRects = callsNamed(h.ctx, 'fillRect');
  assert.deepEqual(fillRects[fillRects.length - 1].args, [0, 0, 640, 480]);

  // Искра осталась на том же пропорциональном месте.
  const arcs = callsNamed(h.ctx, 'arc');
  const after = arcs[arcs.length - 1].args;
  assert.equal(after[0], 640 * 0.5, 'x искры — центр нового кадра');
  assert.equal(after[1], 480 * 0.42, 'y искры — та же доля высоты');
  assert.ok(Math.abs(after[0] / 640 - ratioBefore.x) < 1e-12, 'доля x не изменилась');
  assert.ok(Math.abs(after[1] / 480 - ratioBefore.y) < 1e-12, 'доля y не изменилась');

  // Хелпер позиции согласован с отрисовкой.
  assert.deepEqual(sparkAt(640, 480), { x: after[0], y: after[1] });
});

// --- Строка матрицы: «Нет canvas 2D» -------------------------------------

test('matrix: Нет canvas 2D — текстовая заглушка вместо пустоты, деградация без падения', () => {
  const h = createHarness({ hasCanvas2D: false });

  assert.doesNotThrow(() => bootstrap(h.doc, h.win), 'bootstrap не падает');
  assert.equal(h.elements.fallback.hidden, false, 'заглушка показана');
  assert.equal(h.elements.scene.hidden, true, 'canvas скрыт');
  assert.equal(h.elements.caption.hidden, true, 'подпись скрыта');
  // Кадр не пытался рисоваться.
  assert.equal(callsNamed(h.ctx, 'arc').length, 0, 'отрисовки не было');
});

// --- Строка матрицы: «Первый рендер» — структура страницы -----------------

test('matrix: структура index.html — canvas, подпись «зажги», тёмный фон, скрытая заглушка', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Точка входа: full-screen canvas.
  assert.match(html, /<canvas id="scene"/, 'canvas на месте');
  assert.match(html, /#scene[\s\S]*?width: 100vw[\s\S]*?height: 100vh/, 'canvas full-screen');
  assert.match(html, /background: #000/, 'тёмный фон страницы');

  // Подпись «зажги» — DOM-элемент над canvas, видна с первого рендера.
  assert.match(html, /<p id="caption">зажги<\/p>/, 'подпись «зажги» в разметке');
  assert.match(html, /#caption[\s\S]*?top: 48%/, 'подпись позиционирована у искры');
  assert.doesNotMatch(
    html,
    /<p id="caption" hidden/,
    'подпись не скрыта по умолчанию',
  );

  // Заглушка «нет canvas 2D» есть и скрыта до деградации, текст на месте.
  assert.match(html, /<p id="fallback" hidden>/, 'заглушка скрыта по умолчанию');
  assert.match(html, /не поддерживает 2D Canvas/, 'текст заглушки на месте');
});
