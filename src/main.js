// Bootstrap страницы: размер canvas, кадр рендера, ресайз, деградация —
// и обвязка ритуала первого входа (story 1.3): касание → цикл кадров →
// флаг localStorage. Вся «умная» логика ритуала — чистый src/ritual.js;
// здесь только DOM/localStorage/rAF, всё через аргументы и с guard'ами —
// поэтому тесты гоняют ритуал на стабах без браузера (node:test, без jsdom).

import { renderFrame } from './scene.js';
import { sceneContract } from './contract.js';
import { registerWorld } from './world.js';
import {
  createRitual,
  readFirstVisit,
  writeFirstVisit,
  PHASE_DARK,
  PHASE_FALLING,
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
  // (story 1.4 читает ровно тем же вызовом readFirstVisit).
  const ritual = createRitual({ firstVisit: readFirstVisit(storage) });

  // Единый источник времени кадра: performance.now, иначе Date.now.
  // Тесты подменяют win.performance — ритуал гоняется детерминированно.
  const now = () =>
    win.performance && typeof win.performance.now === 'function'
      ? win.performance.now()
      : Date.now();

  let looping = false;

  /** Ритуал доигран: флаг, подпись, конец цикла. */
  function finishRitual() {
    writeFirstVisit(storage);
    if (caption) caption.hidden = true;
  }

  /**
   * Кадровый цикл ритуала на rAF: идёт, пока фаза не revealed, затем
   * останавливается (постоянная анимация — story 1.5).
   *
   * @returns {boolean} false — rAF недоступен (деградация)
   */
  function scheduleFrames() {
    if (typeof win.requestAnimationFrame !== 'function') return false;
    if (looping) return true;
    looping = true;
    const frame = () => {
      const t = now();
      ritual.update(t);
      render(t);
      if (ritual.phase === PHASE_REVEALED) {
        looping = false;
        finishRitual();
      } else {
        win.requestAnimationFrame(frame);
      }
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
   * @param {number} [t] время кадра в мс; без аргумента — 0 (статичный
   *   кадр, как и раньше); во время ритуала ресайз-кадр берёт now(), чтобы
   *   мир не «откатился» на нулевом времени. Нечисловой t (слушатель
   *   resize получает Event, а не число) отбрасывается тем же путём, что
   *   и отсутствующий — кадр не должен зависеть от типа аргумента.
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
        : ritual.phase === PHASE_FALLING
          ? now()
          : 0;
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
  registerWorld(page.contract, (t) => page.ritual.progress(t));
  page.render();
}
