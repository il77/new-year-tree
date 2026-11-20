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
 * @returns {void}
 */
export function renderFrame(ctx, width, height, t = 0, contract = null) {
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, width, height);
  const { x, y } = sparkAt(width, height);
  drawSpark(ctx, x, y, t);
  if (contract) {
    // Объекты контракта — строго после фона и искры, порядок — по слоям
    // (см. docs/contract.md).
    contract.draw(ctx, width, height, t);
  }
}
