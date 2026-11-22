// Локальный статический сервер без зависимостей — шаг проверки человеком.
// Решение 2026-11-19: URL-деплой вынесен в отдельную задачу эпика.
// Story 2.1: тот же процесс отдаёт статику и считает визиты файлами.
// Обработчик — экспортируемая фабрика: тесты поднимают его на порту 0 со
// временной папкой данных и не открывают рабочий порт.

import http from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 5173);

/** Имя папки с данными визитов (исключена из раздачи и из сборки). */
export const DATA_DIR_NAME = 'data';
/** Имя единственного JSON-файла со счётчиком и последним seed. */
export const VISIT_FILE_NAME = 'visits.json';

/**
 * Чистый агрегат визитов (story 2.2): полные десятки и остаток. Список
 * отдельных визитов не хранится — обе части выводятся из общего числа,
 * поэтому рост состояния ограничен схлопыванием 10→1, а не отказом в входе.
 *
 * @param {number} count общее число визитов
 * @returns {{ tens: number, remainder: number }}
 */
export function aggregateOf(count) {
  const total = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return { tens: Math.floor(total / 10), remainder: total % 10 };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

/** Лежит ли target внутри dir (или равен ему)? */
function isInside(target, dir) {
  const relative = path.relative(dir, target);
  if (relative === '') return true;
  if (relative === '..' || relative.startsWith('..' + path.sep)) return false;
  return !path.isAbsolute(relative);
}

async function resolveFile(urlPath, root, dataDir) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null; // битый percent-encoding — не роняем сервер
  }
  // Путь с «../» — даже если normalize вернул бы его внутрь корня — закрыт:
  // тесты и спецификация требуют 404 на любой обход, а не молчаливую подмену.
  if (decoded.split(/[\\/]/).includes('..')) {
    return null;
  }
  const relative = path.normalize(decoded).replace(/^([/\\])+/, '');
  const filePath = path.join(root, relative);
  // Защита от выхода за пределы корня.
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    return null;
  }
  // Папка данных не раздаётся ни при каких именах файлов внутри неё.
  if (isInside(filePath, dataDir) || isInside(filePath, path.join(root, DATA_DIR_NAME))) {
    return null;
  }
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) {
      return path.join(filePath, 'index.html');
    }
    return filePath;
  } catch {
    return null;
  }
}

/**
 * Создаёт изолированный обработчик запросов.
 *
 * @param {{ root?: string, dataDir?: string }} [options] корень статики и
 *   папка данных; по умолчанию — каталог проекта и `<root>/data`
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function createRequestHandler({ root = ROOT, dataDir } = {}) {
  const resolvedRoot = path.resolve(root);
  const resolvedDataDir = path.resolve(dataDir ?? path.join(resolvedRoot, DATA_DIR_NAME));
  const visitFile = path.join(resolvedDataDir, VISIT_FILE_NAME);

  // Один процесс, но запросы асинхронные: read→write сериализуется, чтобы
  // два одновременных визита не получили одинаковый счётчик.
  let pending = Promise.resolve();

  /** Текущее состояние без учёта нового визита; битый файл = пустой счёт. */
  async function readVisit() {
    try {
      const stored = JSON.parse(await readFile(visitFile, 'utf8'));
      if (
        Number.isFinite(stored?.count) && stored.count >= 0 &&
        Number.isFinite(stored?.seed)
      ) {
        const count = Math.floor(stored.count);
        // Агрегат пересчитывается из count: файлы story 2.1 без новых полей
        // читаются так же, как и файлы с готовым агрегатом.
        return { count, seed: stored.seed, ...aggregateOf(count) };
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        // Битый файл не должен ронять сервер: начинаем счёт заново.
      }
    }
    return { count: 0, seed: 0, ...aggregateOf(0) };
  }

  async function recordVisit() {
    const run = async () => {
      await mkdir(resolvedDataDir, { recursive: true });
      const previous = await readVisit();
      const count = previous.count + 1;
      // Seed от даты/времени. Потребитель координат появится в story 2.3 —
      // сейчас сервер просто сохраняет последний seed вместе со счётчиком.
      const seed = Date.now();
      const visit = { count, seed, ...aggregateOf(count) };
      await writeFile(visitFile, JSON.stringify(visit), 'utf8');
      return visit;
    };
    const result = pending.then(run, run);
    pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  return async function handleRequest(req, res) {
    const urlPath = req.url ?? '/';
    const pathname = urlPath.split('?')[0];

    if (req.method === 'POST' && pathname === '/api/visit') {
      if (typeof req.resume === 'function') req.resume(); // Сливаем тело, если прислали body
      try {
        const visit = await recordVisit();
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(visit));
      } catch {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'visit failed' }));
      }
      return;
    }

    // Общий счётчик для уже открытых вкладок: чтение не добавляет визит.
    // Ждём завершения текущей записи, чтобы не прочитать половинчатый файл.
    if (req.method === 'GET' && pathname === '/api/visit') {
      try {
        const visit = await pending.then(() => readVisit(), () => readVisit());
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(visit));
      } catch {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'visit failed' }));
      }
      return;
    }

    const filePath = await resolveFile(urlPath, resolvedRoot, resolvedDataDir);
    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    try {
      const body = await readFile(filePath);
      const type = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
    }
  };
}

// CLI-запуск: слушатель поднимается только при `node scripts/serve.js`.
// Импорт модуля в тестах не открывает порт.
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const server = http.createServer(createRequestHandler());
  server.listen(PORT, () => {
    console.log(`Сцена: http://localhost:${PORT}`);
  });
}
