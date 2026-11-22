// Клиент общей гирлянды (story 2.1): запрос визита и обновление счётчика —
// отдельные чистые функции с аргументами. Никакого прямого доступа к window,
// поэтому поведение легко стабится в node:test без jsdom.

/**
 * Посылает один запрос визита тому же процессу, что отдаёт статику.
 * Ошибки (сеть, 5xx, битый JSON) молча превращаются в `null`: страница
 * продолжает работать, счётчик остаётся в состоянии «—».
 *
 * @param {typeof fetch} [fetchImpl] реализация fetch; по умолчанию — глобальная
 * @returns {Promise<{count: number, seed: number} | null>} null — визит неучтён
 */
async function requestVisit(fetchImpl, method) {
  if (typeof fetchImpl !== 'function') return null;
  try {
    const response = await fetchImpl('/api/visit', { method });
    if (!response || response.ok === false) return null;
    const payload = await response.json();
    const { count, seed } = payload ?? {};
    if (
      typeof count !== 'number' || !Number.isFinite(count) || count < 0 ||
      typeof seed !== 'number' || !Number.isFinite(seed)
    ) {
      return null;
    }
    return { count, seed };
  } catch {
    return null;
  }
}

/** Один вход: сервер увеличивает общий счётчик и возвращает seed. */
export function fetchVisit(fetchImpl = globalThis.fetch) {
  return requestVisit(fetchImpl, 'POST');
}

/** Чтение общего счётчика без нового входа — для открытых вкладок. */
export function fetchSharedVisit(fetchImpl = globalThis.fetch) {
  return requestVisit(fetchImpl, 'GET');
}

/**
 * Подтягивает общий счётчик в уже открытую вкладку. При ошибке оставляет
 * прежний текст: временный сбой не должен превращать число в тире.
 */
export async function syncCounter(doc, fetchImpl = globalThis.fetch) {
  const visit = await fetchSharedVisit(fetchImpl);
  if (visit) updateCounter(doc, visit.count);
}

/**
 * Показывает число визитов внизу страницы. При отсутствии числа (ошибка
 * запроса) оставляет тире — честный «счётчик недоступен», без нуля.
 *
 * @param {Document} doc документ с элементом #garland-counter
 * @param {number | null} count число визитов или null при деградации
 * @returns {void}
 */
export function updateCounter(doc, count) {
  const counter =
    doc && typeof doc.getElementById === 'function'
      ? doc.getElementById('garland-counter')
      : null;
  if (!counter) return;
  counter.textContent = Number.isFinite(count) && count >= 0 ? String(count) : '—';
}
