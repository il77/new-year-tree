// Счётчик дней до Нового года (tracer bullet epic-calendar): чистая дата,
// DOM-стабы и структура страницы. node:test, без jsdom и новых зависимостей.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { daysUntilNewYear, formatDaysLeft } from '../src/calendar-date.js';
import { updateCalendarCounter } from '../src/calendar-counter.js';
import { bootstrap } from '../src/main.js';
import { createMockCtx } from '../scripts/mock-ctx.js';

// --- Чистая дата ----------------------------------------------------------

test('calendar-date: 31 декабря 2026 — 0 дней (пик)', () => {
  assert.equal(daysUntilNewYear(new Date(2026, 11, 31, 23, 59, 59)), 0);
});

test('calendar-date: 30 декабря 2026 — 1 день', () => {
  assert.equal(daysUntilNewYear(new Date(2026, 11, 30, 12)), 1);
});

test('calendar-date: 1 января невисокосного года — 364 дня', () => {
  // 2026 — невисокосный: 1 января → 31 декабря того же года = 364 дня.
  assert.equal(daysUntilNewYear(new Date(2026, 0, 1)), 364);
});

test('calendar-date: 1 января високосного года — 365 дней', () => {
  assert.equal(daysUntilNewYear(new Date(2024, 0, 1)), 365);
});

test('calendar-date: результат — целое неотрицательное число', () => {
  for (const date of [
    new Date(2025, 0, 1),
    new Date(2025, 6, 15, 8, 30),
    new Date(2025, 11, 31),
  ]) {
    const days = daysUntilNewYear(date);
    assert.ok(Number.isInteger(days) && days >= 0, `${date} → ${days}`);
  }
});

// --- Русское склонение ----------------------------------------------------

test('calendar-date: склонение 0/1/2/5/11/21/22/25', () => {
  const cases = [
    [0, '0 дней'],
    [1, '1 день'],
    [2, '2 дня'],
    [5, '5 дней'],
    [11, '11 дней'],
    [21, '21 день'],
    [22, '22 дня'],
    [25, '25 дней'],
  ];
  for (const [n, expected] of cases) {
    assert.equal(formatDaysLeft(n), expected, `formatDaysLeft(${n})`);
  }
});

// --- DOM-слой -------------------------------------------------------------

test('calendar-counter: пишет правильный текст в #calendar-counter', () => {
  const element = { textContent: '—' };
  const doc = {
    getElementById: (id) => (id === 'calendar-counter' ? element : null),
  };

  updateCalendarCounter(doc, new Date(2026, 11, 31));
  assert.equal(element.textContent, '0 дней до Нового года 🎄');

  updateCalendarCounter(doc, new Date(2026, 11, 30));
  assert.equal(element.textContent, '1 день до Нового года 🎄');

  updateCalendarCounter(doc, new Date(2026, 11, 26));
  assert.equal(element.textContent, '5 дней до Нового года 🎄');
});

test('calendar-counter: отсутствие элемента или документа — тихий no-op', () => {
  const emptyDoc = { getElementById: () => null };
  assert.doesNotThrow(() => updateCalendarCounter(emptyDoc, new Date(2026, 11, 30)));
  assert.doesNotThrow(() => updateCalendarCounter({}, new Date(2026, 11, 30)));
  assert.doesNotThrow(() => updateCalendarCounter(null, new Date(2026, 11, 30)));
});

// --- Разметка -------------------------------------------------------------

test('index.html: #calendar-counter есть и стоит выше canvas, не перехватывает тап', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /<p id="calendar-counter">—<\/p>/, 'счётчик в разметке');
  const counterAt = html.indexOf('<p id="calendar-counter">');
  const canvasAt = html.indexOf('<canvas id="scene"');
  assert.ok(counterAt >= 0 && canvasAt > counterAt, 'счётчик выше canvas');

  const css = html.match(/#calendar-counter\s*\{([\s\S]*?)\}/);
  assert.ok(css, 'стиль #calendar-counter объявлен');
  assert.match(css[1], /position:\s*fixed/);
  assert.match(css[1], /top:\s*1\.2rem/);
  assert.match(css[1], /text-align:\s*center/);
  assert.match(css[1], /font-family:\s*Georgia/);
  assert.match(css[1], /pointer-events:\s*none/, 'тап не перехватывается');
});

// --- Bootstrap-харнесс (паттерн test/matrix.test.js) -----------------------

/** Стаб страницы: те же элементы, что в index.html, без браузера и jsdom. */
function createHarness() {
  const ctx = createMockCtx();
  const elements = {
    'calendar-counter': { textContent: '—' },
    scene: {
      hidden: false,
      width: 0,
      height: 0,
      getContext: (kind) => (kind === '2d' ? ctx : null),
    },
    caption: { hidden: false },
    fallback: { hidden: true },
  };
  const doc = {
    getElementById: (id) => elements[id] ?? null,
  };
  const win = {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener: () => {},
  };
  return { elements, doc, win };
}

test('bootstrap: счётчик дня виден сразу после старта страницы', () => {
  const h = createHarness();
  // Дата инъецирована явно: 4-й аргумент bootstrap не трогает контракт/ritual.
  bootstrap(h.doc, h.win, undefined, new Date(2026, 11, 30, 10));
  assert.equal(h.elements['calendar-counter'].textContent, '1 день до Нового года 🎄');
});
