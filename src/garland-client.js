// Клиент общей гирлянды (story 2.1): запрос визита и обновление счётчика —
// отдельные чистые функции с аргументами. Никакого прямого доступа к window,
// поэтому поведение легко стабится в node:test без jsdom.

/**
 * Посылает один запрос визита тому же процессу, что отдаёт статику.
 * Ошибки (сеть, 5xx, битый JSON) молча превращаются в `null`: страница
 * продолжает работать, счётчик остаётся в состоянии «—».
 *
 * @param {typeof fetch} [fetchImpl] реализация fetch; по умолчанию — глобальная
 * @returns {Promise<{count: number, seed: number, tens?: number, remainder?: number} | null>}
 *   null — визит неучтён; агрегат необязателен (старый сервер или деградация)
 */
async function requestVisit(fetchImpl, method) {
  if (typeof fetchImpl !== 'function') return null;
  try {
    const response = await fetchImpl('/api/visit', { method });
    if (!response || response.ok === false) return null;
    const payload = await response.json();
    const { count, seed, tens, remainder } = payload ?? {};
    if (
      typeof count !== 'number' || !Number.isFinite(count) || count < 0 ||
      typeof seed !== 'number' || !Number.isFinite(seed)
    ) {
      return null;
    }
    const visit = { count, seed };
    // Агрегат — необязательное поле того же ответа: принимаем только если
    // он согласован с count, иначе получатель выведет его из count.
    if (
      Number.isInteger(tens) && tens >= 0 &&
      Number.isInteger(remainder) && remainder >= 0 && remainder < 10 &&
      tens === Math.floor(count / 10) && remainder === count % 10
    ) {
      visit.tens = tens;
      visit.remainder = remainder;
    }
    return visit;
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
 * прежний текст: временный сбой не должен превращать число в тире. Полный
 * ответ (счётчик + агрегат) отдаётся в onVisit — так GET-опрос обновляет и
 * гирлянду той же вкладки, не создавая второй объект сцены.
 *
 * @param {Document} doc документ с элементом #garland-counter
 * @param {typeof fetch} [fetchImpl] реализация fetch
 * @param {(visit: {count: number, seed: number, tens?: number, remainder?: number}) => void} [onVisit]
 *   обработчик успешного ответа
 */
export async function syncCounter(doc, fetchImpl = globalThis.fetch, onVisit = null) {
  const visit = await fetchSharedVisit(fetchImpl);
  if (!visit) return;
  updateCounter(doc, visit.count);
  if (typeof onVisit === 'function') onVisit(visit);
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
