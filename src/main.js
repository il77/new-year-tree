// Bootstrap страницы: размер canvas, кадр рендера, ресайз, деградация —
// и обвязка ритуала первого входа (story 1.3): касание → цикл кадров →
// флаг localStorage. Живая сцена (story 1.5): тот же ЕДИНЫЙ rAF-цикл гонит
// и ритуал, и постоянную анимацию — после revealed он не останавливается,
// пока открыта страница, и вкладка-пауза экономит CPU (visibilitychange).
// Вся «умная» логика ритуала и математика движения — чистые функции
// (src/ritual.js, src/animation.js); здесь только DOM/localStorage/rAF,
// всё через аргументы и с guard'ами — поэтому тесты гоняют цикл на стабах
// с управляемыми часами (node:test, без jsdom).

import { renderFrame } from './scene.js';
import { sceneContract } from './contract.js';
import { registerWorld } from './world.js';
import { fetchVisit, syncCounter, updateCounter } from './garland-client.js';
import { registerGarland } from './garland.js';
import {
  createRitual,
  readFirstVisit,
  writeFirstVisit,
  PHASE_DARK,
  PHASE_REVEALED,
} from './ritual.js';

/**
 * Подключает сцену к DOM-элементам страницы.
 *
 * @param {Document} doc документ с #scene, #caption, #fallback
 * @param {Window} win окно с innerWidth/innerHeight и addEventListener
 * @param {{ draw: Function }} [contract] контракт рендера (src/contract.js);
 *   по умолчанию — общий sceneContract страницы, в тестах — изолированный
 *   экземпляр createSceneContract()
 * @returns {{ render: (t?: number) => void, contract: object, ritual: object }}
 *   кадр для повторной отрисовки, контракт (для эпиков 2–4) и контроллер
 *   ритуала (тесты гоняют его по времени явными t)
 */
export function bootstrap(doc, win, contract = sceneContract) {
  const canvas = doc.getElementById('scene');
  const caption = doc.getElementById('caption');
  const fallback = doc.getElementById('fallback');

  // Хранилище: даже доступ к win.localStorage может бросать (SecurityError
  // в приватных/запрещённых контекстах) — читаем через try/catch.
  let storage = null;
  try {
    storage = win.localStorage ?? null;
  } catch {
    storage = null;
  }

  // Флаг первого входа: есть "1" → сразу готовый мир, ритуал не играется
  // (story 1.4: тот же вызов readFirstVisit доказан в test/repeat.test.js).
  const ritual = createRitual({ firstVisit: readFirstVisit(storage) });

  // Единый источник времени кадра: performance.now, иначе Date.now.
  // Тесты подменяют win.performance — ритуал гоняется детерминированно.
  const now = () =>
    win.performance && typeof win.performance.now === 'function'
      ? win.performance.now()
      : Date.now();

  let looping = false;
  // Мир был готов ещё до bootstrap (флаг story 1.4): цикл живой сцены
  // стартует сразу, но флаг переписывать не нужно — writeFirstVisit
  // относится только к ритуалу, доигранному здесь и сейчас.
  const revealedAtStart = ritual.phase === PHASE_REVEALED;
  // Флаг и подпись — ровно один раз за сессию: цикл продолжается на
  // revealed и не должен перезаписывать хранилище на каждом кадре.
  let ritualFinished = false;

  /** Вкладка скрыта? Guard: у стабов doc.hidden может не быть. */
  function pageIsHidden() {
    return Boolean(doc) && doc.hidden === true;
  }

  /** Ритуал доигран: флаг, подпись — ровно один раз за сессию. */
  function finishRitual() {
    if (ritualFinished) return;
    ritualFinished = true;
    writeFirstVisit(storage);
    if (caption) caption.hidden = true;
  }

  /**
   * Единый кадровый цикл страницы (story 1.3 + 1.5): гонит ритуал и
   * постоянную анимацию живой сцены, пока страница открыта. На revealed
   * НЕ останавливается (R11: движение не останавливается, пока открыта
   * страница); остановка — только при скрытой вкладке (CPU) и без rAF/2D.
   * Повторный вызов (касание, возобновление вкладки) — no-op: guard
   * `looping` держит ровно один цикл, второй не появляется.
   *
   * @returns {boolean} false — rAF или 2D недоступны (деградация)
   */
  function scheduleFrames() {
    if (typeof win.requestAnimationFrame !== 'function') return false;
    if (looping) return true;
    // Без 2D-контекста анимировать нечего — цикл не планируем (там же
    // render() уходит в текстовую заглушку, деградация без падения).
    if (typeof canvas.getContext !== 'function' || !canvas.getContext('2d')) return false;
    looping = true;
    const frame = () => {
      if (pageIsHidden()) {
        // Вкладка скрыта: кадр не рисуем и не перепланируем — цикл встаёт,
        // его вернёт visibilitychange. looping = false — точка возобновления
        // без риска двойного цикла (guard в scheduleFrames).
        looping = false;
        return;
      }
      const t = now();
      ritual.update(t);
      render(t);
      // Флаг ставит именно цикл (story 1.3), один раз (guard) и только если
      // ритуал доигран здесь — при повторном входе записи не нужны.
      if (!revealedAtStart && ritual.phase === PHASE_REVEALED) finishRitual();
      win.requestAnimationFrame(frame);
    };
    win.requestAnimationFrame(frame);
    return true;
  }

  // Касание/клик/тап в любом месте тёмной страницы — зона ритуала:
  // точно попадать по искре на тач-экране неприятно (тихий вход R10).
  function onTouch() {
    if (fallback && !fallback.hidden) return; // уже деградация — тихо
    if (!ritual.touch(now())) return; // фаза не dark — идемпотентный no-op
    // Подпись «зажги» тихо гаснет (CSS-transition), без поп-апов.
    if (caption && caption.style) caption.style.opacity = '0';
    if (canvas.style) canvas.style.cursor = '';
    if (!scheduleFrames()) {
      // Без requestAnimationFrame анимация невозможна — мир проявляется
      // мгновенно, флаг ставится тем же путём (деградация без падения).
      ritual.finish();
      render(now());
      finishRitual();
    }
  }

  /**
   * @param {number} [t] время кадра в мс; без аргумента — 0 для тёмной
   *   фазы (статичный кадр, как и раньше) и `now()` для фаз с живой сценой
   *   (revealed: ресайз-кадр не «откатывает» покачивание камеры в ноль).
   *   Нечисловой t (слушатель resize получает Event, а не число)
   *   отбрасывается тем же путём, что и отсутствующий — кадр не должен
   *   зависеть от типа аргумента.
   * @returns {void}
   */
  function render(t) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      // Старый браузер без 2D Canvas: текстовая заглушка вместо пустоты,
      // деградация без падения.
      canvas.hidden = true;
      caption.hidden = true;
      fallback.hidden = false;
      return;
    }

    // Ресайз: canvas растягивается на окно; искра позиционируется долями
    // экрана (renderFrame/sparkAt), поэтому остаётся на своём месте.
    // Присваивание пропускается, если размер не изменился: во время
    // ритуала это сберегает очистку холста на каждом кадре.
    if (canvas.width !== win.innerWidth) canvas.width = win.innerWidth;
    if (canvas.height !== win.innerHeight) canvas.height = win.innerHeight;

    const time =
      typeof t === 'number' && Number.isFinite(t)
        ? t
        : ritual.phase === PHASE_DARK
          ? 0
          : now();
    renderFrame(ctx, canvas.width, canvas.height, time, contract, ritual);
  }

  render();

  // Флаг уже стоял — мир с первого кадра, подпись «зажги» не показывается.
  if (ritual.phase === PHASE_REVEALED && caption) caption.hidden = true;
  // Тихая affordance: тёмная страница кликабельна целиком — указатель.
  if (ritual.phase === PHASE_DARK && canvas.style) canvas.style.cursor = 'pointer';

  // pointerdown покрывает мышь и тач; touchstart/mousedown — запасные ветки
  // для окружений без PointerEvent. Guard: стабы могут не иметь
  // addEventListener (как в test/matrix.test.js).
  if (typeof canvas.addEventListener === 'function') {
    for (const type of ['pointerdown', 'touchstart', 'mousedown']) {
      canvas.addEventListener(type, onTouch);
    }
  }

  // Обёртка обязательна: браузер передаёт в слушатель Event — без неё
  // (и без coerce в render) искра получала бы NaN и пропадала после ресайза.
  win.addEventListener('resize', () => render());

  // Живая сцена при повторном входе: мир готов с первого кадра — цикл
  // стартует сразу. В фазе dark анимировать нечего (слои не видны, искра
  // статична): там цикл стартует только от касания — порог-ритуал (R9/R10)
  // остаётся тихой статикой, а дальше движение не останавливается.
  if (ritual.phase === PHASE_REVEALED) scheduleFrames();

  // Вкладка скрыта — цикл останавливается (кадр в frame() сам не
  // перепланируется) и возобновляется при возврате. Guard'ы для стабов:
  // у doc может не быть addEventListener, doc.hidden — см. pageIsHidden().
  // Фаза dark при возобновлении не анимируется — поведение не меняется.
  if (typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', () => {
      if (!pageIsHidden() && ritual.phase !== PHASE_DARK) scheduleFrames();
    });
  }

  return { render, contract, ritual };
}

// Точка входа страницы (index.html грузит этот модуль) + общий рендер-хэндл:
// в браузере `page = { render, contract, ritual }`, в Node/тестах — null.
// Поздняя регистрация объекта: sceneContract.register(...); page.render() —
// см. docs/contract.md.
export const page = typeof document !== 'undefined' ? bootstrap(document, window) : null;

// Объекты мира — на странице через общий контракт слоями (снег 5 → лес 8 →
// ёлка 10, гирлянда 20 ляжет поверх). Прогресс берётся у контроллера
// страницы. Вне браузера page === null — общий sceneContract не трогается,
// тесты изолированы (contract.test.js: «общий экземпляр не засорён»).
// Регистрация + render() идут в том же тике, что и первый кадр, — браузер
// не успевает нарисовать кадр без мира.
if (page) {
  const progressAt = (t) => page.ritual.progress(t);
  registerWorld(page.contract, progressAt);
  // Гирлянда: ровно один объект слоя 20, зарегистрирован рядом с миром на
  // том же рендер-хэндле, без второго цикла. Появляется вместе с ёлкой.
  // Локальное время здесь не нужно: seed приходит из ответа сервера (POST
  // или GET-опрос) и попадает в ту же гирлянду через setState — все вкладки
  // видят одну раскладку. Повторная регистрация дала бы вторую гирлянду.
  // Прогресс тот же, что у мира: в тёмной фазе ёлки нет — огоньков нет.
  const garland = registerGarland(page.contract, 0, progressAt);
  page.render();

  // Визит уходит на тот же процесс, что отдал страницу. До ответа — «—»;
  // fetchVisit глотает сетевую ошибку и вернёт null, тишина в консоли.
  // Агрегат из ответа приходит в уже зарегистрированную гирлянду.
  const applyVisit = (visit) => {
    if (!visit) return;
    updateCounter(document, visit.count);
    garland.setState(visit);
  };
  updateCounter(document, null);
  fetchVisit().then(applyVisit);
  // Другие вкладки подтягивают общий счётчик без нового входа: визит в одном
  // браузере становится виден в другом — тот же агрегат и огоньки в одной
  // гирлянде. Один таймер DOM, не rAF и не экран.
  setInterval(() => {
    syncCounter(document, undefined, applyVisit);
  }, 3000);
}
