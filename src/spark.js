// Чистая функция рендера искры: принимает ctx как аргумент,
// не трогает глобальное состояние — поэтому тестируется на моке.

export const SPARK_POSITION = { xRatio: 0.5, yRatio: 0.42 };

export const GLOW_LAYERS = [
  { radius: 22, color: 'rgba(255, 200, 80, 0.10)' },
  { radius: 15, color: 'rgba(255, 220, 120, 0.20)' },
  { radius: 9, color: 'rgba(255, 240, 190, 0.38)' },
];

export const CORE_RADIUS = 4;
export const CORE_COLOR = '#fffdf2';

export const RAY_COUNT = 8;
export const RAY_INNER = 7;
export const RAY_OUTER = 16;
export const RAY_COLOR = 'rgba(255, 245, 210, 0.85)';
export const RAY_WIDTH = 1.5;

/**
 * Рисует статичную искру «зажги» в точке (x, y).
 *
 * @param {CanvasRenderingContext2D} ctx 2D-контекст (в тесте — мок)
 * @param {number} x центр искры по горизонтали
 * @param {number} y центр искры по вертикали
 * @param {number} t время в мс; влияет только на лёгкое мерцание масштаба
 * @returns {void}
 */
export function drawSpark(ctx, x, y, t = 0) {
  // Статичный кадр (t = 0) даёт масштаб 1; анимация — scope story 1.5.
  // t в миллисекундах: sin(t / 1000) — период 2π·1000 мс ≈ 6.3 с,
  // плавное мерцание, а не стробоскоп.
  const twinkle = 1 + 0.08 * Math.sin(t / 1000);

  // Свечение: концентрические круги с убывающей непрозрачностью.
  for (const layer of GLOW_LAYERS) {
    ctx.beginPath();
    ctx.arc(x, y, layer.radius * twinkle, 0, Math.PI * 2);
    ctx.fillStyle = layer.color;
    ctx.fill();
  }

  // Лучи: восемь штрихов из центра наружу, одним stroke.
  ctx.beginPath();
  for (let i = 0; i < RAY_COUNT; i += 1) {
    const angle = (Math.PI * 2 * i) / RAY_COUNT;
    const inner = RAY_INNER * twinkle;
    const outer = RAY_OUTER * twinkle;
    ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
    ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
  }
  ctx.strokeStyle = RAY_COLOR;
  ctx.lineWidth = RAY_WIDTH;
  ctx.stroke();

  // Ядро: тёпло-белая точка в центре.
  ctx.beginPath();
  ctx.arc(x, y, CORE_RADIUS * twinkle, 0, Math.PI * 2);
  ctx.fillStyle = CORE_COLOR;
  ctx.fill();
}
