// Общие стабы тестов сцены (refactor sweep, story 1.6): мок-2D-контекст и
// выборки по записанным вызовам. Раньше мок дублировался в пяти тестовых
// файлах (три копии байт-в-байт) — теперь один источник. Рекордеры пишут
// только при фактическом вызове, поэтому надмножество методов не добавляет
// вызовов и не меняет утверждения тестов. Стабы страницы (createHarness и
// хранилища) остаются в своих файлах: они различаются по сценариям.

import { BACKGROUND } from '../src/scene.js';

/**
 * Мок-2D-контекст: фиксирует вызовы отрисовки без jsdom/canvas-зависимостей.
 *
 * @returns {object} контекст с массивом `calls` ({ name, args })
 */
export function createMockCtx() {
  const calls = [];
  const record = (name, ...args) => calls.push({ name, args });
  let globalAlpha = 1;
  return {
    calls,
    beginPath: (...a) => record('beginPath', ...a),
    arc: (...a) => record('arc', ...a),
    arcTo: (...a) => record('arcTo', ...a),
    fill: (...a) => record('fill', ...a),
    fillRect: (...a) => record('fillRect', ...a),
    moveTo: (...a) => record('moveTo', ...a),
    lineTo: (...a) => record('lineTo', ...a),
    quadraticCurveTo: (...a) => record('quadraticCurveTo', ...a),
    closePath: (...a) => record('closePath', ...a),
    stroke: (...a) => record('stroke', ...a),
    save: (...a) => record('save', ...a),
    restore: (...a) => record('restore', ...a),
    translate: (...a) => record('translate', ...a),
    rotate: (...a) => record('rotate', ...a),
    scale: (...a) => record('scale', ...a),
    createLinearGradient: (...a) => {
      record('createLinearGradient', ...a);
      return { addColorStop: (...s) => record('addColorStop', ...s) };
    },
    createRadialGradient: (...a) => {
      record('createRadialGradient', ...a);
      return { addColorStop: (...s) => record('addColorStop', ...s) };
    },
    get globalAlpha() {
      return globalAlpha;
    },
    set globalAlpha(value) {
      record('globalAlpha', value);
      globalAlpha = value;
    },
    set fillStyle(value) {
      record('fillStyle', value);
    },
    set strokeStyle(value) {
      record('strokeStyle', value);
    },
    set lineWidth(value) {
      record('lineWidth', value);
    },
  };
}

/** Все вызовы контекста с именем name. */
export function callsNamed(ctx, name) {
  return ctx.calls.filter((call) => call.name === name);
}

/** Вызовы кадра начиная с fromIndex (история ctx накапливается). */
export function frameCalls(ctx, fromIndex) {
  return ctx.calls.slice(fromIndex);
}

/** Крупные круги 10–30 px — только свечение искры (мир рисует мелкие
 *  снежинки и крупную тень-эллипс ёлки радиуса > 100). */
export function sparkArcsIn(calls) {
  return calls.filter((c) => c.name === 'arc' && c.args[2] > 10 && c.args[2] < 30);
}

/**
 * Фоновые кадры: прямоугольники, которым предшествовал `fillStyle = BACKGROUND`.
 * Счёт по цвету фона, а не по факту `fillRect`: легальный прямоугольник
 * будущего слоя (маска, атмосферная полоса) за кадр не считается.
 *
 * @param {Array<{name: string, args: Array}>} calls записанные вызовы мока
 * @returns {Array<{name: string, args: Array}>} вызовы фонового fillRect
 */
export function backgroundRectsIn(calls) {
  let color;
  const frames = [];
  for (const call of calls) {
    if (call.name === 'fillStyle') color = call.args[0];
    else if (call.name === 'fillRect' && color === BACKGROUND) frames.push(call);
  }
  return frames;
}
