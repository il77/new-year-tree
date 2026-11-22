import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  drawSpark,
  GLOW_LAYERS,
  CORE_RADIUS,
  CORE_COLOR,
  RAY_COUNT,
  RAY_COLOR,
} from '../src/spark.js';
import { createMockCtx, callsNamed } from '../scripts/mock-ctx.js';

test('drawSpark рисует свечение: слои-круги и заливки', () => {
  const ctx = createMockCtx();
  drawSpark(ctx, 320, 200);

  const arcs = callsNamed(ctx, 'arc');
  const fills = callsNamed(ctx, 'fill');
  const fillStyles = callsNamed(ctx, 'fillStyle').map((c) => c.args[0]);

  // Свечение (слои) + ядро — все круги нарисованы в точке (320, 200).
  assert.equal(arcs.length, GLOW_LAYERS.length + 1);
  for (const call of arcs) {
    assert.equal(call.args[0], 320, 'arc по x — в заданной точке');
    assert.equal(call.args[1], 200, 'arc по y — в заданной точке');
    assert.ok(call.args[2] > 0, 'радиус положительный');
  }

  // Каждый слой свечения залит своим цветом, ядро — тёпло-белым.
  for (const layer of GLOW_LAYERS) {
    assert.ok(fillStyles.includes(layer.color), `заливка слоя ${layer.color}`);
  }
  assert.ok(fillStyles.includes(CORE_COLOR), 'ядро залито CORE_COLOR');
  assert.ok(fills.length >= GLOW_LAYERS.length + 1, 'заливки для слоев и ядра');
});

test('drawSpark рисует лучи: moveTo/lineTo и один stroke', () => {
  const ctx = createMockCtx();
  drawSpark(ctx, 100, 50);

  const moveTos = callsNamed(ctx, 'moveTo');
  const lineTos = callsNamed(ctx, 'lineTo');
  const strokes = callsNamed(ctx, 'stroke');
  const strokeStyles = callsNamed(ctx, 'strokeStyle').map((c) => c.args[0]);

  // RAY_COUNT лучей = RAY_COUNT moveTo + RAY_COUNT lineTo, один общий stroke.
  assert.equal(moveTos.length, RAY_COUNT, 'начало каждого луча зафиксировано');
  assert.equal(lineTos.length, RAY_COUNT, 'конец каждого луча зафиксирован');
  assert.equal(strokes.length, 1, 'лучи вычерчены одним stroke');
  assert.ok(strokeStyles.includes(RAY_COLOR), 'цвет лучей зафиксирован');
});

test('drawSpark — чистая: одинаковый ввод даёт одинаковые вызовы, t влияет только на масштаб', () => {
  const a = createMockCtx();
  const b = createMockCtx();
  drawSpark(a, 10, 20, 0);
  drawSpark(b, 10, 20, 0);
  assert.deepEqual(a.calls, b.calls, 'детерминирована при t = 0');

  const c = createMockCtx();
  drawSpark(c, 10, 20, 1234);
  assert.notDeepEqual(a.calls, c.calls, 't меняет масштаб мерцания');
  assert.equal(callsNamed(c, 'arc').length, callsNamed(a, 'arc').length, 'структура кадра не меняется');
});
