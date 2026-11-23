// Story 2.1 + 2.2 — сквозной путь «визит → агрегат → счётчик → огоньки».
// Тесты без новых пакетов: node:http на порту 0, временная папка данных,
// мок 2D-контекста. Проверки story 2.1 (один огонёк, фон кадра) не тронуты:
// новые огоньки и сияние проверяются отдельными тестами.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { aggregateOf, createRequestHandler, VISIT_FILE_NAME } from '../scripts/serve.js';
import { createMockCtx, callsNamed } from '../scripts/mock-ctx.js';
import { createSceneContract } from '../src/contract.js';
import { fetchSharedVisit, fetchVisit, syncCounter, updateCounter } from '../src/garland-client.js';
import {
  GARLAND_BIG_RADIUS,
  GARLAND_CORE_RADIUS,
  GARLAND_GLOW_COUNT,
  GARLAND_GLOW_STOPS,
  GARLAND_LAYER,
  normalizeGarlandState,
  registerGarland,
} from '../src/garland.js';
import { createRitual } from '../src/ritual.js';
import { renderFrame } from '../src/scene.js';
import {
  GARLAND_DAY_COLORS,
  GARLAND_ROW_COUNT,
  GARLAND_TIER_COUNT,
  dayColor,
  dayIndexFor,
  lightPalette,
  slotPlacement,
} from '../src/garland-layout.js';

/** Один HTTP-запрос к тестовому серверу. */
function send(port, urlPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: urlPath, method },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

const post = (port, urlPath = '/api/visit') => send(port, urlPath, 'POST');
const get = (port, urlPath) => send(port, urlPath, 'GET');

/**
 * Поднимает изолированный сервер на порту 0. Папка данных по умолчанию
 * лежит вне корня статики — как и рабочая, но во временном каталоге.
 */
async function startServer(t, { dataInsideRoot = false } = {}) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'garland-test-'));
  const root = path.join(tmp, 'site');
  await mkdir(root, { recursive: true });
  const indexHtml = '<!doctype html><title>ok</title>';
  await writeFile(path.join(root, 'index.html'), indexHtml);
  await writeFile(path.join(tmp, 'outside.txt'), 'top secret');
  const dataDir = dataInsideRoot ? path.join(root, 'data') : path.join(tmp, 'data');

  const server = http.createServer(createRequestHandler({ root, dataDir }));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(tmp, { recursive: true, force: true });
  });
  return { port, root, dataDir, tmp, indexHtml };
}

function makeDoc() {
  const counter = { textContent: '' };
  return {
    counter,
    getElementById: (id) => (id === 'garland-counter' ? counter : null),
  };
}

/** Пишет состояние в файл данных — в том числе старый формат без агрегата. */
async function seedVisits(dataDir, state) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(dataDir, VISIT_FILE_NAME), JSON.stringify(state), 'utf8');
}

/** Кадр гирлянды с заданным агрегатом: один объект, изолированный контракт. */
function garlandFrame(state, progressAt = null) {
  const contract = createSceneContract();
  const garland = registerGarland(contract, 7, progressAt, state);
  const ctx = createMockCtx();
  contract.draw(ctx, 1280, 800, 0);
  return { contract, garland, ctx };
}

/** Радиусы ядер в кадре: у шара ореол = радиус × 4, ядро — сам радиус. */
function coreRadii(ctx) {
  return callsNamed(ctx, 'arc')
    .map((call) => call.args[2])
    .filter((r) => r === GARLAND_BIG_RADIUS || r === GARLAND_CORE_RADIUS);
}

const byRadius = (a, b) => a - b;

/** Позиции всех дуг кадра: ореол и ядро каждого огонька. */
const lightPositions = (ctx) =>
  callsNamed(ctx, 'arc').map((call) => [call.args[0], call.args[1]]);

/** Цвета ядер: стоп 0.35 используется только в градиенте шара. */
const coreColors = (ctx) =>
  callsNamed(ctx, 'addColorStop')
    .filter((call) => call.args[0] === 0.35)
    .map((call) => call.args[1]);

/** Прозрачный край ореола — из палитры дня, выбранной человеком. */
function transparentEdge(dayIndex) {
  const n = Number.parseInt(GARLAND_DAY_COLORS[dayIndex].slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0)`;
}

/** Оттенок hex-цвета в градусах — для проверки семейства цвета дня. */
function hueOf(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h / 6) * 360;
}

/** Светлота hex-цвета в процентах — для проверки разброса огоньков. */
function lightnessOf(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return ((Math.max(...channels) + Math.min(...channels)) / 2) * 100;
}

/** Два seed одного местного дня (полдень UTC + секунда — вне смены даты). */
function seedsOfSameDay() {
  const base = Date.UTC(2026, 0, 1, 12);
  return [base, base + 1000];
}

/** Два seed с разными местными днями — подбор не зависит от часового пояса. */
function seedsOfDifferentDays() {
  const base = Date.UTC(2026, 0, 1, 12);
  for (let i = 1; i < 8; i += 1) {
    const other = base + i * 24 * 60 * 60 * 1000;
    if (new Date(base).getDay() !== new Date(other).getDay()) return [base, other];
  }
  throw new Error('не удалось подобрать seed с другим днём недели');
}

test('первый визит: POST /api/visit создаёт файл, считает 1 и возвращает seed', async (t) => {
  const { port, dataDir } = await startServer(t);
  const res = await post(port);

  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /^application\/json/);
  assert.equal(res.headers['cache-control'], 'no-store');
  const body = JSON.parse(res.body);
  assert.equal(body.count, 1);
  assert.equal(typeof body.seed, 'number');
  assert.ok(Number.isFinite(body.seed));

  const files = await readdir(dataDir);
  assert.equal(files.length, 1, 'счётчик живёт одним файлом на сервере');
  const stored = JSON.parse(await readFile(path.join(dataDir, files[0]), 'utf8'));
  assert.deepEqual(stored, body, 'в файле тот же счётчик и последний seed');
});

test('второй визит: счётчик 2; параллельные визиты не теряются', async (t) => {
  const { port } = await startServer(t);
  const first = JSON.parse((await post(port)).body);
  const second = JSON.parse((await post(port)).body);

  assert.equal(first.count, 1);
  assert.equal(second.count, 2, 'второй браузер видит обновлённое число');
  assert.ok(Number.isFinite(second.seed));

  // read→write сериализован: два одновременно пришедших запроса получают
  // разные номера визита, а не один и тот же count.
  const parallel = await Promise.all([post(port), post(port)]);
  const counts = parallel.map((res) => JSON.parse(res.body).count).sort((a, b) => a - b);
  assert.deepEqual(counts, [3, 4]);
});

test('две вкладки: второй вход даёт 2, первая догоняет общий счётчик', async (t) => {
  const { port } = await startServer(t);
  const makeFetch = () => async (url, options) => {
    const res = await send(port, url, options?.method ?? 'GET');
    return {
      ok: res.status >= 200 && res.status < 300,
      json: async () => JSON.parse(res.body),
    };
  };
  const firstDoc = makeDoc();
  const secondDoc = makeDoc();
  const firstFetch = makeFetch();
  const secondFetch = makeFetch();

  const firstVisit = await fetchVisit(firstFetch);
  updateCounter(firstDoc, firstVisit.count);
  const secondVisit = await fetchVisit(secondFetch);
  updateCounter(secondDoc, secondVisit.count);
  assert.equal(firstDoc.counter.textContent, '1');
  assert.equal(secondDoc.counter.textContent, '2');

  // Первая вкладка подтягивает общее число без нового визита.
  await syncCounter(firstDoc, firstFetch);
  assert.equal(firstDoc.counter.textContent, '2');
  const readBack = await fetchSharedVisit(secondFetch);
  assert.deepEqual(
    readBack,
    { count: 2, seed: secondVisit.seed, tens: 0, remainder: 2 },
    'чтение не меняет счётчик и возвращает тот же агрегат',
  );

  // У каждой вкладки ровно один огонёк слоя 20.
  for (let i = 0; i < 2; i += 1) {
    const contract = createSceneContract();
    registerGarland(contract, secondVisit.seed);
    assert.equal(contract.size, 1);
    const ctx = createMockCtx();
    contract.draw(ctx, 1280, 800, 0);
    assert.equal(callsNamed(ctx, 'arc').length, 2);
  }
});

test('garland-client: fetch-стаб отделён от window и обновляет счётчик', async () => {
  const calls = [];
  const fetchStub = async (...args) => {
    calls.push(args);
    return { ok: true, json: async () => ({ count: 7, seed: 123 }) };
  };

  assert.deepEqual(await fetchVisit(fetchStub), { count: 7, seed: 123 });
  assert.deepEqual(calls, [['/api/visit', { method: 'POST' }]]);

  const doc = makeDoc();
  updateCounter(doc, 7);
  assert.equal(doc.counter.textContent, '7');
  updateCounter(doc, null);
  assert.equal(doc.counter.textContent, '—');
});

test('деградация: fetch отклонён — счётчик «—», ритуал и кадр работают', async () => {
  const failingFetch = async () => {
    throw new Error('offline');
  };
  assert.equal(await fetchVisit(failingFetch), null, 'ошибка запроса проглочена');
  assert.equal(await fetchVisit(null), null, 'fetch недоступен — деградация через guard typeof');

  const doc = makeDoc();
  updateCounter(doc, null);
  assert.equal(doc.counter.textContent, '—');

  // Один огонёк остаётся на сцене и при недоступном сервере: seed локальный,
  // кадр идёт через тот же контракт и тот же ритуал.
  const contract = createSceneContract();
  registerGarland(contract, Date.now());
  const ritual = createRitual({ firstVisit: true });
  const ctx = createMockCtx();
  renderFrame(ctx, 1280, 800, 4000, contract, ritual);

  assert.equal(ritual.phase, 'revealed');
  assert.equal(callsNamed(ctx, 'fillRect').length, 1, 'только фон кадра');
  assert.ok(callsNamed(ctx, 'arc').length >= 2, 'огонёк нарисован');
});

test('registerGarland: один объект слоя 20, градиентный шар без fillRect', () => {
  const isolated = createSceneContract();
  const registrations = [];
  const contract = {
    register(draw, options) {
      registrations.push({ draw, options });
      isolated.register(draw, options);
    },
    draw: (...args) => isolated.draw(...args),
    get size() {
      return isolated.size;
    },
  };

  assert.equal(contract.size, 0);
  registerGarland(contract, 999);
  assert.equal(contract.size, 1, 'ровно одна регистрация');
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].options.layer, 20);
  assert.equal(GARLAND_LAYER, 20);

  const ctx = createMockCtx();
  contract.draw(ctx, 1280, 800, 0);
  const arcs = callsNamed(ctx, 'arc');
  const gradients = callsNamed(ctx, 'createRadialGradient');
  const stops = callsNamed(ctx, 'addColorStop').map((call) => call.args[1]);

  assert.equal(callsNamed(ctx, 'fillRect').length, 0, 'объект не рисует прямоугольники');
  assert.equal(arcs.length, 2, 'ореол + ядро — один шар');
  assert.equal(gradients.length, 2, 'мягкий ореол и объёмное ядро');
  assert.ok(arcs.some((call) => Math.abs(call.args[2] - GARLAND_CORE_RADIUS * 4) < 1e-9));
  assert.ok(arcs.some((call) => Math.abs(call.args[2] - GARLAND_CORE_RADIUS) < 1e-9));
  assert.ok(
    stops.includes(transparentEdge(new Date(999).getDay())),
    'ореол растворяется в прозрачный край палитры выбранного дня',
  );
  assert.ok(stops.includes('#fffdf2'), 'блик верх-слева');

  // Блик смещён влево-вверх от центра ядра (источник света общий для сцены).
  const coreGradient = gradients[1];
  assert.ok(coreGradient.args[0] < coreGradient.args[3]);
  assert.ok(coreGradient.args[1] < coreGradient.args[4]);

  // Как и registerWorld: пока ёлки нет (tree <= 0), огонёк не рисуется.
  const darkCtx = createMockCtx();
  const darkContract = createSceneContract();
  registerGarland(darkContract, 1, () => ({ layers: { tree: 0 } }));
  darkContract.draw(darkCtx, 1280, 800, 0);
  assert.equal(callsNamed(darkCtx, 'arc').length, 0, 'тёмная фаза — огонька нет');
});

test('закрытый путь: /data/… и ../ дают 404, статика и MIME работают как раньше', async (t) => {
  const { port, dataDir, tmp, indexHtml } = await startServer(t, { dataInsideRoot: true });
  await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(dataDir, 'secret.txt'), 'visit secret');

  const ok = await get(port, '/index.html');
  assert.equal(ok.status, 200);
  assert.match(ok.headers['content-type'], /^text\/html/);
  assert.equal(ok.body, indexHtml);

  for (const urlPath of [
    '/data',
    '/data/secret.txt',
    '/data/../secret.txt',
    '/../outside.txt',
    '/%2e%2e/outside.txt',
  ]) {
    const res = await get(port, urlPath);
    assert.equal(res.status, 404, `${urlPath} → 404`);
    assert.ok(!res.body.includes('secret'), `${urlPath} не утекает содержимое файла`);
  }

  // Запрос визита продолжает работать, даже когда папка данных внутри корня.
  const visit = JSON.parse((await post(port)).body);
  assert.equal(visit.count, 1);
});

test('агрегат: чистые полные десятки и остаток, в том числе старый ответ без полей', () => {
  assert.deepEqual(aggregateOf(0), { tens: 0, remainder: 0 });
  assert.deepEqual(aggregateOf(9), { tens: 0, remainder: 9 });
  assert.deepEqual(aggregateOf(10), { tens: 1, remainder: 0 });
  assert.deepEqual(aggregateOf(11), { tens: 1, remainder: 1 });
  assert.deepEqual(aggregateOf(299), { tens: 29, remainder: 9 });
  assert.deepEqual(aggregateOf(300), { tens: 30, remainder: 0 });
  assert.deepEqual(aggregateOf(NaN), { tens: 0, remainder: 0 });
  assert.deepEqual(
    normalizeGarlandState({ count: 11, seed: 1 }),
    { count: 11, tens: 1, remainder: 1, seed: 1 },
    'нет агрегата в ответе — выводим его из count',
  );
});

test('десятый вход: count 9 → 10, один полный десяток, всё состояние одним файлом', async (t) => {
  const { port, dataDir } = await startServer(t);
  await seedVisits(dataDir, { count: 9, seed: 111 }); // файл story 2.1 без агрегата

  const res = await post(port);
  assert.equal(res.status, 200, 'ни один визит не отклонён');
  const visit = JSON.parse(res.body);
  assert.equal(visit.count, 10);
  assert.equal(visit.tens, 1);
  assert.equal(visit.remainder, 0);
  assert.ok(Number.isFinite(visit.seed));

  const files = await readdir(dataDir);
  assert.equal(files.length, 1, 'счётчик и агрегат живут одним файлом');
  const stored = JSON.parse(await readFile(path.join(dataDir, VISIT_FILE_NAME), 'utf8'));
  assert.deepEqual(stored, visit);
  assert.deepEqual(
    Object.keys(stored).sort(),
    ['count', 'remainder', 'seed', 'tens'],
    'в файле нет списка отдельных визитов',
  );

  const readBack = JSON.parse((await get(port, '/api/visit')).body);
  assert.deepEqual(readBack, visit, 'GET не добавляет визит и отдаёт тот же агрегат');
});

test('одиннадцатый вход: count 10 → 11, десяток и остаток 1, счётчик «11»', async (t) => {
  const { port, dataDir } = await startServer(t);
  await seedVisits(dataDir, { count: 10, seed: 222, tens: 1, remainder: 0 });

  const res = await post(port);
  assert.equal(res.status, 200);
  const visit = JSON.parse(res.body);
  assert.equal(visit.count, 11);
  assert.equal(visit.tens, 1);
  assert.equal(visit.remainder, 1);

  const doc = makeDoc();
  updateCounter(doc, visit.count);
  assert.equal(doc.counter.textContent, '11');
  const readBack = JSON.parse((await get(port, '/api/visit')).body);
  assert.deepEqual(readBack, visit, 'опрос не меняет состояние');
});

test('кадр гирлянды: десять входов — один большой огонёк, одиннадцать — большой и мелкий', () => {
  const ten = garlandFrame({ count: 10, seed: 1, tens: 1, remainder: 0 });
  assert.equal(ten.contract.size, 1, 'ровно одна регистрация слоя 20');
  assert.equal(callsNamed(ten.ctx, 'fillRect').length, 0, 'ни одного прямоугольника');
  assert.deepEqual(coreRadii(ten.ctx), [GARLAND_BIG_RADIUS], 'вместо десяти мелких — один большой');
  assert.equal(
    callsNamed(ten.ctx, 'createRadialGradient').length,
    2,
    'большой огонёк — тот же шар: ореол + ядро',
  );

  const state11 = (seed) => ({ count: 11, seed, tens: 1, remainder: 1 });
  const eleven = garlandFrame(state11(1));
  assert.deepEqual(coreRadii(eleven.ctx).sort(byRadius), [GARLAND_CORE_RADIUS, GARLAND_BIG_RADIUS]);

  // Один seed — одна и та же картинка на обоих кадрах (позиции и цвета).
  const again = garlandFrame(state11(1));
  assert.deepEqual(lightPositions(again.ctx), lightPositions(eleven.ctx), 'повтор seed → те же позиции');
  assert.deepEqual(coreColors(again.ctx), coreColors(eleven.ctx), 'повтор seed → те же цвета');

  // Разные seed в один день недели: раскладка другая, число и радиусы те же.
  const [daySeed, otherSeed] = seedsOfSameDay();
  const first = garlandFrame(state11(daySeed));
  const second = garlandFrame(state11(otherSeed));
  assert.deepEqual(coreRadii(first.ctx), coreRadii(second.ctx), 'число и радиусы от seed не зависят');
  assert.notDeepEqual(lightPositions(first.ctx), lightPositions(second.ctx), 'разные seed → разные позиции');

  // Новое состояние приходит в уже зарегистрированный объект.
  ten.garland.setState(state11(1));
  const updated = createMockCtx();
  ten.contract.draw(updated, 1280, 800, 0);
  assert.equal(ten.contract.size, 1, 'второй регистрации нет');
  assert.deepEqual(coreRadii(updated).sort(byRadius), [GARLAND_CORE_RADIUS, GARLAND_BIG_RADIUS]);
  assert.deepEqual(ten.garland.state, { count: 11, tens: 1, remainder: 1, seed: 1 });
});

test('garland-layout: чистая раскладка по seed и палитра по дню недели', () => {
  const [seed, otherSeed] = seedsOfSameDay();
  assert.deepEqual(slotPlacement(seed, 0), slotPlacement(seed, 0), 'повтор вызова — тот же результат');
  assert.notDeepEqual(slotPlacement(seed, 0), slotPlacement(otherSeed, 0), 'разные seed — разные точки');

  for (let slot = 0; slot < 20; slot += 1) {
    const { tier, row, across, shade } = slotPlacement(seed, slot);
    assert.ok(Number.isInteger(tier) && tier >= 0 && tier < GARLAND_TIER_COUNT, 'ярус в границах ёлки');
    assert.ok(Number.isInteger(row) && row >= 0 && row < GARLAND_ROW_COUNT, 'ряд в границах яруса');
    assert.ok(across >= -1 && across <= 1, 'поперёк внутри яруса');
    assert.ok(shade >= 0 && shade <= 1, 'оттенок в границах');
  }

  assert.equal(dayIndexFor(seed), new Date(seed).getDay(), 'день по местному времени браузера');
  for (let day = 0; day < GARLAND_DAY_COLORS.length; day += 1) {
    assert.equal(dayColor(seed, day), GARLAND_DAY_COLORS[day], `палитра дня ${day}`);
  }
  const palette = lightPalette(seed, 0, 1);
  assert.deepEqual(lightPalette(seed, 0, 1), palette, 'палитра чистая');
  assert.equal(palette.haloFar, transparentEdge(1), 'прозрачный край — цвет дня');
  assert.notEqual(lightPalette(seed, 1, 1).core, palette.core, 'оттенок зависит от номера огонька');

  const cores = Array.from({ length: 20 }, (_, slot) => lightPalette(seed, slot, 1).core);
  const lightness = cores.map(lightnessOf);
  assert.ok(Math.max(...lightness) - Math.min(...lightness) > 15, 'разброс светлоты заметен');
  const hues = cores.map(hueOf);
  assert.ok(Math.max(...hues) - Math.min(...hues) > 10, 'разброс оттенка заметен');
});

test('цвет огоньков: день недели меняет палитру, оттенки детерминированно различаются', () => {
  const [firstSeed, otherSeed] = seedsOfDifferentDays();
  const firstDay = new Date(firstSeed).getDay();
  const otherDay = new Date(otherSeed).getDay();
  const frameFor = (seed) => garlandFrame({
    count: 25,
    seed,
    tens: 2,
    remainder: 5,
  });
  const first = frameFor(firstSeed);
  const other = frameFor(otherSeed);

  for (const [ctx, day] of [[first.ctx, firstDay], [other.ctx, otherDay]]) {
    const stops = callsNamed(ctx, 'addColorStop').map((call) => call.args[1]);
    assert.ok(stops.includes(transparentEdge(day)), `прозрачный край палитры дня ${day}`);
    const colors = coreColors(ctx);
    assert.equal(colors.length, 7, 'по одному цвету ядра на огонёк');
    assert.ok(new Set(colors).size > 1, 'оттенки огоньков различаются');
    const baseHue = hueOf(GARLAND_DAY_COLORS[day]);
    for (const color of colors) {
      assert.ok(Math.abs(hueOf(color) - baseHue) < 12, `${color} — оттенок дня ${day}`);
    }
  }
  assert.notDeepEqual(coreColors(first.ctx), coreColors(other.ctx), 'другой день — другая палитра');
  assert.deepEqual(coreRadii(first.ctx), coreRadii(other.ctx), 'радиусы от дня недели не зависят');
});

test('новый seed из опроса: та же гирлянда рисует новую раскладку', () => {
  const [seed, nextSeed] = seedsOfSameDay();
  const state = { count: 11, seed, tens: 1, remainder: 1 };
  const contract = createSceneContract();
  const garland = registerGarland(contract, 0, null, state);
  const before = createMockCtx();
  contract.draw(before, 1280, 800, 0);

  garland.setState({ ...state, seed: nextSeed });
  const after = createMockCtx();
  contract.draw(after, 1280, 800, 0);

  assert.equal(contract.size, 1, 'второй регистрации нет');
  assert.equal(garland.state.seed, nextSeed, 'seed обновлён');
  assert.deepEqual(coreRadii(after), coreRadii(before), 'число и радиусы те же');
  assert.notDeepEqual(lightPositions(after), lightPositions(before), 'новая раскладка на том же объекте');
});

test('сияние ёлки: 300 входов — тёплый градиент вокруг ёлки, при 299 его нет', () => {
  const stateFor = (count) => ({
    count,
    seed: 1,
    tens: Math.floor(count / 10),
    remainder: count % 10,
  });
  const below = garlandFrame(stateFor(GARLAND_GLOW_COUNT - 1));
  const full = garlandFrame(stateFor(GARLAND_GLOW_COUNT));
  const stopsOf = (ctx) => callsNamed(ctx, 'addColorStop').map((call) => call.args[1]);

  for (const [, color] of GARLAND_GLOW_STOPS) {
    assert.ok(!stopsOf(below.ctx).includes(color), `при 299 нет стопа ${color}`);
    assert.ok(stopsOf(full.ctx).includes(color), `при 300 есть стоп ${color}`);
  }
  const glowGradients = callsNamed(full.ctx, 'createRadialGradient')
    .filter((call) => call.args[2] === 8); // внутренний радиус из мока
  assert.equal(glowGradients.length, 1, 'один градиент сияния всей ёлки');
  assert.ok(glowGradients[0].args[5] > 100, 'радиус покрывает всю ёлку');
  assert.ok(
    callsNamed(full.ctx, 'arc').some(
      (call) => Math.abs(call.args[2] - glowGradients[0].args[5]) < 1e-9,
    ),
    'сияние — круглый градиентный силуэт, не fillRect',
  );
  assert.equal(callsNamed(full.ctx, 'fillRect').length, 0);
  const cores = coreRadii(full.ctx);
  assert.equal(
    cores.filter((r) => r === GARLAND_BIG_RADIUS).length,
    30,
    '30 полных десятков — 30 больших огоньков',
  );
  assert.equal(cores.filter((r) => r === GARLAND_CORE_RADIUS).length, 0);

  const dark = garlandFrame(stateFor(300), () => ({ layers: { tree: 0 } }));
  assert.equal(callsNamed(dark.ctx, 'arc').length, 0, 'тёмная фаза остаётся тёмной');
  assert.equal(callsNamed(dark.ctx, 'createRadialGradient').length, 0);
});

test('garland-client: агрегат — необязательное поле того же ответа', async () => {
  const withAggregate = async () => ({
    ok: true,
    json: async () => ({ count: 11, seed: 5, tens: 1, remainder: 1 }),
  });
  assert.deepEqual(await fetchVisit(withAggregate), { count: 11, seed: 5, tens: 1, remainder: 1 });

  const without = async () => ({ ok: true, json: async () => ({ count: 11, seed: 5 }) });
  assert.deepEqual(await fetchSharedVisit(without), { count: 11, seed: 5 });

  const broken = async () => ({
    ok: true,
    json: async () => ({ count: 11, seed: 5, tens: 'x', remainder: 99 }),
  });
  assert.deepEqual(await fetchVisit(broken), { count: 11, seed: 5 }, 'битый агрегат отброшен');
});

test('две вкладки: GET-опрос доносит тот же агрегат в одну гирлянду', async (t) => {
  const { port } = await startServer(t);
  const makeFetch = () => async (url, options) => {
    const res = await send(port, url, options?.method ?? 'GET');
    return {
      ok: res.status >= 200 && res.status < 300,
      json: async () => JSON.parse(res.body),
    };
  };
  const firstFetch = makeFetch();
  const secondFetch = makeFetch();
  let own;
  for (let i = 0; i < 11; i += 1) own = await fetchVisit(firstFetch);
  assert.equal(own.count, 11);

  const firstDoc = makeDoc();
  const secondDoc = makeDoc();
  const firstContract = createSceneContract();
  const secondContract = createSceneContract();
  const firstGarland = registerGarland(firstContract, 1);
  const secondGarland = registerGarland(secondContract, 2);
  const apply = (doc, garland) => (visit) => {
    updateCounter(doc, visit.count);
    garland.setState(visit);
  };

  apply(firstDoc, firstGarland)(own);
  await syncCounter(secondDoc, secondFetch, apply(secondDoc, secondGarland));

  assert.equal(firstDoc.counter.textContent, '11');
  assert.equal(secondDoc.counter.textContent, '11');
  assert.deepEqual(firstGarland.state, secondGarland.state);
  assert.deepEqual(secondGarland.state, { count: 11, tens: 1, remainder: 1, seed: own.seed });
  assert.equal(firstContract.size, 1, 'в первой вкладке одна гирлянда');
  assert.equal(secondContract.size, 1, 'во второй вкладке одна гирлянда');

  const frame = createMockCtx();
  secondContract.draw(frame, 1280, 800, 0);
  assert.deepEqual(coreRadii(frame).sort(byRadius), [GARLAND_CORE_RADIUS, GARLAND_BIG_RADIUS]);
});

test('деградация без сервера: гирлянда держит безопасный локальный набор', async () => {
  const failingFetch = async () => {
    throw new Error('offline');
  };
  assert.equal(await fetchVisit(failingFetch), null);

  const contract = createSceneContract();
  const localSeed = 12345;
  const garland = registerGarland(contract, localSeed);
  assert.deepEqual(garland.state, { count: 1, tens: 0, remainder: 1, seed: localSeed });
  const ctx = createMockCtx();
  contract.draw(ctx, 1280, 800, 0);
  assert.deepEqual(coreRadii(ctx), [GARLAND_CORE_RADIUS], 'одинокий огонёк story 2.1');
  assert.equal(callsNamed(ctx, 'fillRect').length, 0);
});

test('гирлянда едет вместе с rise ярусов во время проявления ёлки', () => {
  const state = { count: 11, seed: 1, tens: 1, remainder: 1 };
  const steady = garlandFrame(state);
  const rising = garlandFrame(state, () => ({ layers: { tree: 0.5 } }));
  const shift = (1 - 0.5) * 800 * 0.015;
  const arcYs = (ctx) => callsNamed(ctx, 'arc').map((call) => call.args[1]);
  const steadyYs = arcYs(steady.ctx);
  const risingYs = arcYs(rising.ctx);
  assert.equal(risingYs.length, steadyYs.length, 'счётчик вызовов не изменился');
  for (let i = 0; i < steadyYs.length; i += 1) {
    assert.ok(
      Math.abs(risingYs[i] - steadyYs[i] - shift) < 1e-9,
      `огонёк ${i} сдвинут на rise ярусов`,
    );
  }

  const glowState = { count: 300, seed: 1, tens: 30, remainder: 0 };
  const glowSteady = garlandFrame(glowState);
  const glowRising = garlandFrame(glowState, () => ({ layers: { tree: 0.5 } }));
  const glowCy = (ctx) => callsNamed(ctx, 'createRadialGradient')
    .filter((call) => call.args[2] === 8)[0].args[1];
  assert.ok(
    Math.abs(glowCy(glowRising.ctx) - glowCy(glowSteady.ctx) - shift) < 1e-9,
    'центр сияния сдвинут на тот же rise',
  );

  const dark = garlandFrame(state, () => ({ layers: { tree: 0 } }));
  assert.equal(callsNamed(dark.ctx, 'arc').length, 0, 'gating tree <= 0 сохранён');
});

test('агрегат сверяется с count: рассогласованный ответ не рисует чужие огоньки', async () => {
  const inconsistent = { count: 11, seed: 5, tens: 30, remainder: 9 };
  const stub = async (payload) => ({
    ok: true,
    json: async () => payload,
  });
  assert.deepEqual(
    await fetchVisit(() => stub(inconsistent)),
    { count: 11, seed: 5 },
    'клиент отбросил агрегат, не согласованный с count',
  );
  assert.deepEqual(
    normalizeGarlandState(inconsistent),
    { count: 11, tens: 1, remainder: 1, seed: 5 },
    'гирлянда вывела агрегат из count',
  );

  const consistent = { count: 21, seed: 5, tens: 2, remainder: 1 };
  assert.deepEqual(await fetchVisit(() => stub(consistent)), consistent, 'согласованный агрегат прошёл');
  assert.deepEqual(normalizeGarlandState(consistent), { count: 21, tens: 2, remainder: 1, seed: 5 });

  const contract = createSceneContract();
  const garland = registerGarland(contract, 1, null, inconsistent);
  const ctx = createMockCtx();
  contract.draw(ctx, 1280, 800, 0);
  assert.deepEqual(garland.state, { count: 11, tens: 1, remainder: 1, seed: 5 });
  assert.deepEqual(coreRadii(ctx).sort(byRadius), [GARLAND_CORE_RADIUS, GARLAND_BIG_RADIUS]);
});
