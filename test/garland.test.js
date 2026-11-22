// Story 2.1 — сквозной путь «визит → счётчик → огонёк». Тесты без новых
// пакетов: node:http на порту 0, временная папка данных, мок 2D-контекста.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createRequestHandler } from '../scripts/serve.js';
import { createMockCtx, callsNamed } from '../scripts/mock-ctx.js';
import { createSceneContract } from '../src/contract.js';
import { fetchSharedVisit, fetchVisit, syncCounter, updateCounter } from '../src/garland-client.js';
import { GARLAND_CORE_RADIUS, GARLAND_LAYER, registerGarland } from '../src/garland.js';
import { createRitual } from '../src/ritual.js';
import { renderFrame } from '../src/scene.js';

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
  assert.deepEqual(readBack, { count: 2, seed: secondVisit.seed }, 'чтение не меняет счётчик');

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
  assert.ok(stops.includes('rgba(255, 176, 64, 0)'), 'ореол растворяется в край');
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
