// Page-ветка src/main.js (finding 21): в обычном Node-тесте `page === null`,
// а с подставленными globals загруженный модуль проходит bootstrap, регистрирует
// мир и гирлянду, рисует кадр и подключает fetch/таймер. Динамический импорт с
// уникальным query даёт свежий экземпляр main.js; изоляция от остальных тестов —
// process-per-file в node --test. main.js импортирует ./contract.js без query,
// поэтому page-ветка регистрирует объекты в общем sceneContract.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMockCtx, callsNamed, backgroundRectsIn } from '../scripts/mock-ctx.js';
import { sceneContract } from '../src/contract.js';
import { GARLAND_DAY_COLORS, dayIndexFor } from '../src/garland-layout.js';
import { FIRST_VISIT_KEY, FIRST_VISIT_VALUE, PHASE_REVEALED } from '../src/ritual.js';
import { WORLD_COLORS } from '../src/world.js';

let importSeq = 0;
/** Свежий экземпляр main.js: query уникален, поэтому ESM-кэш не переиспользуется. */
const importMain = (tag) =>
  import(new URL(`../src/main.js?${tag}=${++importSeq}`, import.meta.url).href);

/** Дожидаемся всех микротасок fetch().then(...) и json(). */
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('main: без document обычный Node-импорт даёт page === null', async () => {
  const mod = await importMain('node');
  assert.equal(mod.page, null, 'вне браузера page не создаётся');
});

test('main: page-ветка — bootstrap, мир и гирлянда, render, fetch и таймер', async () => {
  const saved = {
    document: globalThis.document,
    window: globalThis.window,
    fetch: globalThis.fetch,
    setInterval: globalThis.setInterval,
  };
  const ctx = createMockCtx();
  const counter = { textContent: '—' };
  const canvas = {
    hidden: false,
    width: 0,
    height: 0,
    style: {},
    getContext: (kind) => (kind === '2d' ? ctx : null),
    addEventListener: () => {},
  };
  const elements = {
    scene: canvas,
    caption: { hidden: false, style: {} },
    fallback: { hidden: true },
    'garland-counter': counter,
  };
  const doc = {
    hidden: false,
    getElementById: (id) => elements[id] ?? null,
    addEventListener: () => {},
  };
  const rafQueue = [];
  const win = {
    innerWidth: 1280,
    innerHeight: 800,
    localStorage: {
      getItem: (key) => (key === FIRST_VISIT_KEY ? FIRST_VISIT_VALUE : null),
      setItem: () => {},
    },
    requestAnimationFrame: (fn) => {
      rafQueue.push(fn);
      return rafQueue.length;
    },
    addEventListener: () => {},
  };
  const fetchCalls = [];
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, method: options?.method });
    return {
      ok: true,
      json: async () => ({ count: 12, seed: 7, tens: 1, remainder: 2 }),
    };
  };
  const timers = [];
  globalThis.setInterval = (fn, ms) => {
    timers.push({ fn, ms });
    return timers.length;
  };

  globalThis.document = doc;
  globalThis.window = win;
  const sizeBefore = sceneContract.size;
  try {
    const mod = await importMain('browser');
    assert.ok(mod.page, 'page создан');
    assert.equal(mod.page.contract, sceneContract, 'page работает с общим sceneContract');
    assert.equal(mod.page.ritual.phase, PHASE_REVEALED, 'флаг «1» — готовый мир');
    assert.equal(rafQueue.length, 1, 'живой цикл запланирован');
    // bootstrap вызван без контракта: registerWorld добавляет три объекта
    // (снег 5 / лес 8 / ёлка 10), registerGarland — четвёртый (слой 20),
    // registerCalendar — пятый (слой 21, звезда epic-calendar).
    assert.equal(
      sceneContract.size,
      sizeBefore + 5,
      'мир, гирлянда и звезда добавили ровно пять объектов к общему контракту',
    );
    assert.ok(backgroundRectsIn(ctx.calls).length > 0, 'render() вызван — кадр нарисован');
    const stops = callsNamed(ctx, 'addColorStop').map((call) => call.args[1]);
    assert.ok(stops.includes(WORLD_COLORS.treeLight), 'мир уже в первом кадре страницы');
    // Прозрачный край ореола — цвет дня из GARLAND_DAY_COLORS; мир его не
    // использует, поэтому стоп доказывает именно регистрацию гирлянды.
    // Кадр нарисован до ответа fetch — seed ещё локальный (0).
    const day = Number.parseInt(GARLAND_DAY_COLORS[dayIndexFor(0)].slice(1), 16);
    const garlandEdge = `rgba(${(day >> 16) & 255}, ${(day >> 8) & 255}, ${day & 255}, 0)`;
    assert.ok(stops.includes(garlandEdge), 'гирлянда нарисована в кадре страницы');

    await tick();
    assert.deepEqual(fetchCalls.map((c) => c.method), ['POST'], 'один вход — POST /api/visit');
    assert.equal(fetchCalls[0].url, '/api/visit', 'адрес запроса не изменился');
    assert.equal(counter.textContent, '12', 'ответ визита дошёл до счётчика');
    assert.equal(timers.length, 1, 'один таймер опроса');
    assert.equal(timers[0].ms, 3000, 'интервал 3 с');

    // Тот же таймер догоняет счётчик без нового входа: GET, не POST.
    timers[0].fn();
    await tick();
    assert.deepEqual(fetchCalls.map((c) => c.method), ['POST', 'GET'], 'опрос — GET');
    assert.equal(counter.textContent, '12', 'счётчик после опроса не сброшен');
  } finally {
    // Снимаем стабы: остальные тесты процесса не должны увидеть «браузер».
    for (const name of ['document', 'window', 'fetch', 'setInterval']) {
      if (saved[name] === undefined) delete globalThis[name];
      else globalThis[name] = saved[name];
    }
  }
});
