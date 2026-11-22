// Рендер-кадр сцены: чистые функции, тестируемые без браузера и DOM.
// Статичный кадр (t = 0) — как в 1.3/1.4; живая сцена (story 1.5): при t > 0
// кадр слегка покачивается — камера из src/animation.js трансформирует
// искру и объекты контракта (фон остаётся нетронутым — не появляются щели).

import { drawSpark, SPARK_POSITION } from './spark.js';
import { cameraAt, isCameraNeutral } from './animation.js';

export const BACKGROUND = '#000';

/**
 * Страховочный запас масштаба контента при покачивании камеры (2%).
 * Камера сдвигает/поворачивает/сжимает сцену, и край контента (снежное поле
 * доходит до `x = 0/w`, `y = h`) мог бы «отъехать» внутрь кадра на несколько
 * пикселей — у края мелькала бы чёрная полоска. Небольшой запас держит края
 * за пределами кадра; на глаз почти не заметен.
 */
export const CONTENT_OVERSCAN = 1.02;

/**
 * Координаты искры в долях экрана — при ресайзе искра остаётся
 * на своём пропорциональном месте (центр-выше).
 *
 * @param {number} width ширина кадра
 * @param {number} height высота кадра
 * @returns {{ x: number, y: number }}
 */
export function sparkAt(width, height) {
  return {
    x: width * SPARK_POSITION.xRatio,
    y: height * SPARK_POSITION.yRatio,
  };
}

/**
 * Рисует полный кадр: чёрный фон на весь кадр + искра + объекты контракта.
 * При t > 0 вся сцена (искра + контракт) слегка покачивается камерой —
 * sinusoidal, амплитуды ограничены константами CAMERA (src/animation.js).
 * Статичный кадр (t = 0, нечисловое t) — камера нейтральна, вызовов
 * трансформации нет вовсе (старое поведение кадра сохранено байт-в-байт).
 *
 * @param {CanvasRenderingContext2D} ctx 2D-контекст (в тесте — мок)
 * @param {number} width текущая ширина кадра (canvas)
 * @param {number} height текущая высота кадра (canvas)
 * @param {number} t время в мс; 0 — статичный кадр; сюда же приходит
 *   живое время кадрового цикла (story 1.5)
 * @param {{ draw: (ctx: CanvasRenderingContext2D, width: number, height: number, t: number) => void } | null} [contract]
 *   контракт рендера (src/contract.js): объекты эпиков 2–4 рисуются после
 *   фона и искры; null — кадр только из фона и искры
 * @param {{ progress: (t: number) => { spark: { yRatio: number, alpha: number } } } | null} [ritual]
 *   контроллер ритуала (src/ritual.js): искра падает и гаснет по прогрессу;
 *   null — прежний статичный кадр (поведение без ритуала не меняется)
 * @returns {void}
 */
export function renderFrame(ctx, width, height, t = 0, contract = null, ritual = null) {
  // Фон — вне трансформации: покачивание не оставляет чёрных щелей
  // по краям (и само движение контента — «сцена», а не «пустота»).
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, width, height);

  // Камера (story 1.5): сдвиг к центру → поворот → масштаб → обратно.
  // Точка (width/2, height/2) смещается на (dx, dy) — вся сцена качается
  // как одна камера, объекты контракта ничего об этом не знают.
  const camera = cameraAt(t);
  const moving = !isCameraNeutral(camera);
  if (moving) {
    ctx.save();
    ctx.translate(
      width / 2 + camera.dxRatio * width,
      height / 2 + camera.dyRatio * height,
    );
    ctx.rotate(camera.rotation);
    // Небольшой запас поверх «дыхания» камеры: край контента не должен
    // оказываться внутри кадра даже при минимальном scale и максимальном
    // сдвиге.
    ctx.scale(camera.scale * CONTENT_OVERSCAN, camera.scale * CONTENT_OVERSCAN);
    ctx.translate(-width / 2, -height / 2);
  }

  // Горизонталь искры — одна и та же в статичном кадре и в ритуале
  // (sparkAt), по вертикали ритуал берёт позицию из своего прогресса.
  const sparkPoint = sparkAt(width, height);
  if (ritual) {
    // Ритуал: позиция/непрозрачность искры — чистый прогресс по t.
    const { spark } = ritual.progress(t);
    drawSpark(ctx, sparkPoint.x, spark.yRatio * height, t, spark.alpha);
  } else {
    drawSpark(ctx, sparkPoint.x, sparkPoint.y, t);
  }
  if (contract) {
    // Объекты контракта — строго после фона и искры, порядок — по слоям
    // (см. docs/contract.md).
    contract.draw(ctx, width, height, t);
  }

  if (moving) ctx.restore();
}
