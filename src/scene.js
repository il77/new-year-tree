// Рендер-кадр сцены: чистые функции, тестируемые без браузера и DOM.

import { drawSpark, SPARK_POSITION } from './spark.js';

export const BACKGROUND = '#000';

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
 *
 * @param {CanvasRenderingContext2D} ctx 2D-контекст (в тесте — мок)
 * @param {number} width текущая ширина кадра (canvas)
 * @param {number} height текущая высота кадра (canvas)
 * @param {number} t время в мс; 0 — статичный кадр (анимация — story 1.5)
 * @param {{ draw: (ctx: CanvasRenderingContext2D, width: number, height: number, t: number) => void } | null} [contract]
 *   контракт рендера (src/contract.js): объекты эпиков 2–4 рисуются после
 *   фона и искры; null — кадр только из фона и искры
 * @param {{ progress: (t: number) => { spark: { yRatio: number, alpha: number } } } | null} [ritual]
 *   контроллер ритуала (src/ritual.js): искра падает и гаснет по прогрессу;
 *   null — прежний статичный кадр (поведение без ритуала не меняется)
 * @returns {void}
 */
export function renderFrame(ctx, width, height, t = 0, contract = null, ritual = null) {
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, width, height);
  if (ritual) {
    // Ритуал: позиция/непрозрачность искры — чистый прогресс по t.
    const { spark } = ritual.progress(t);
    drawSpark(ctx, width * SPARK_POSITION.xRatio, spark.yRatio * height, t, spark.alpha);
  } else {
    const { x, y } = sparkAt(width, height);
    drawSpark(ctx, x, y, t);
  }
  if (contract) {
    // Объекты контракта — строго после фона и искры, порядок — по слоям
    // (см. docs/contract.md).
    contract.draw(ctx, width, height, t);
  }
}
