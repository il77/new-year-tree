// Живая сцена (story 1.5): чистая математика движения — детерминирована по
// времени t (мс), без DOM и глобалов, тестируется на node:test (test/live.test.js).
// Всё time-based: поведение зависит только от t, не от частоты кадров и не от
// счётчика вызовов — при 30/60/120 Гц и после паузы вкладки картина одна.
// Используется из src/scene.js (камера) и src/world.js (снег, огоньки).
// Мягкость движения (R10: тихо, без рывков и вспышек) задают только
// константы CAMERA и границы мерцания — их проверяет тест.

const TAU = Math.PI * 2;

/**
 * Камера: sinusoidal покачивание всей сцены. Амплитуды малы осознанно —
 * движение заметно, но не укачивает и не рвёт ритуал (≤ 0.22% ширины,
 * ≤ 0.16° поворота). При t = 0 все синусы равны 0 → камера нейтральна
 * (контракт: t = 0 — статичный кадр, docs/contract.md).
 */
export const CAMERA = {
  /** Период сдвига по горизонтали, мс. */
  swayPeriod: 11000,
  /** Амплитуда сдвига по горизонтали, доля ширины кадра. */
  swayRatio: 0.0022,
  /** Период сдвига по вертикали, мс (не кратен горизонтальному — качка живая). */
  driftPeriod: 17000,
  /** Амплитуда сдвига по вертикали, доля высоты кадра. */
  driftRatio: 0.0015,
  /** Период поворота камеры, мс. */
  tiltPeriod: 23000,
  /** Максимальный поворот, радианы (≈0.16°). */
  tiltRad: 0.0028,
  /** Период «дыхания» масштаба, мс. */
  breathePeriod: 31000,
  /** Отклонение масштаба от 1 (±0.6% — сцена «дышит», щелей не оставляет). */
  breatheScale: 0.006,
};

/**
 * Чистое состояние камеры для времени t.
 *
 * @param {number} t время кадра в мс; нечисловое → 0 (статичный кадр)
 * @returns {{ dxRatio: number, dyRatio: number, rotation: number, scale: number }}
 *   сдвиг долями кадра, поворот в радианах и масштаб
 */
export function cameraAt(t) {
  const time = Number.isFinite(t) ? t : 0;
  return {
    dxRatio: CAMERA.swayRatio * Math.sin((TAU * time) / CAMERA.swayPeriod),
    dyRatio: CAMERA.driftRatio * Math.sin((TAU * time) / CAMERA.driftPeriod),
    rotation: CAMERA.tiltRad * Math.sin((TAU * time) / CAMERA.tiltPeriod),
    scale: 1 + CAMERA.breatheScale * Math.sin((TAU * time) / CAMERA.breathePeriod),
  };
}

/**
 * Нейтральна ли камера (трансформация не нужна). При t = 0 — всегда true
 * по построению: статичный кадр обходится без save/translate/rotate/scale.
 *
 * @param {{ dxRatio: number, dyRatio: number, rotation: number, scale: number }} camera
 * @returns {boolean}
 */
export function isCameraNeutral(camera) {
  return (
    camera.dxRatio === 0 &&
    camera.dyRatio === 0 &&
    camera.rotation === 0 &&
    camera.scale === 1
  );
}

/**
 * Полоса падения снежинок, доли высоты: от неба до кромки снежного поля.
 * Заворачивается по кругу (wrap), поэтому снег падает бесконечно.
 */
export const SNOW_BAND = { top: 0.03, bottom: 0.72 };

/**
 * Чистое состояние снежинки для времени t: падение с wrap по полосе,
 * боковая качка и мягкое мерцание (альфа 0.78..1 — без стробоскопа).
 * У снежинки есть собственные параметры движения (см. FLAKES в world.js),
 * поэтому кадры с разными t визуально различаются, но всегда детерминированы.
 *
 * @param {{
 *   xRatio: number, yRatio: number,
 *   fallPeriod: number, swayAmp: number, swayPeriod: number, swayPhase: number,
 *   twinklePeriod: number, twinklePhase: number,
 * }} flake параметры снежинки
 * @param {number} t время кадра в мс; нечисловое → 0
 * @returns {{ xRatio: number, yRatio: number, alpha: number }}
 *   позиция долями кадра и коэффициент мерцания
 */
export function flakeState(flake, t) {
  const time = Number.isFinite(t) ? t : 0;
  const span = SNOW_BAND.bottom - SNOW_BAND.top;
  // Падение: доля пройденного пути растёт со временем и заворачивается
  // внутри полосы — снежинка появляется сверху после выхода за низ.
  const cycles = (flake.yRatio - SNOW_BAND.top) / span + time / flake.fallPeriod;
  const yRatio = SNOW_BAND.top + (cycles - Math.floor(cycles)) * span;
  // Боковая качка: сдвиг вокруг исходной x, амплитуда ≤ swayAmp.
  const xRatio =
    flake.xRatio + flake.swayAmp * Math.sin((TAU * time) / flake.swayPeriod + flake.swayPhase);
  return { xRatio, yRatio, alpha: 0.78 + 0.22 * twinkleAt(time, flake.twinklePeriod, flake.twinklePhase) };
}

/**
 * Мягкое мерцание 0..1 для времени t (сдвиг синуса в [0, 1]).
 * Периоды выбираются в секундах — дыхание, а не мигание (R10).
 *
 * @param {number} t время кадра в мс; нечисловое → 0
 * @param {number} period период в мс
 * @param {number} phase фаза в радианах (разные огоньки мигают не в унисон)
 * @returns {number} значение в [0, 1]
 */
export function twinkleAt(t, period, phase) {
  const time = Number.isFinite(t) ? t : 0;
  return 0.5 + 0.5 * Math.sin((TAU * time) / period + phase);
}
