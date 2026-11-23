// Календарная звезда (epic-calendar, story 2): кривая яркости 31→0, пик
// 31 декабря, объёмный гладкий кадр (R12), тёмная фаза и регистрация на
// общем контракте слоем 21. node:test + общий мок-ctx, без jsdom/зависимостей.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMockCtx, callsNamed } from '../scripts/mock-ctx.js';
import { createSceneContract } from '../src/contract.js';
import { GARLAND_GLOW_STOPS } from '../src/garland.js';
import {
  CALENDAR_LAYER,
  STAR_WINDOW_DAYS,
  drawCalendarStar,
  isPeakDay,
  registerCalendar,
  starBrightness,
} from '../src/calendar-star.js';

/** Фиксированные даты: 0, 1 и 16 дней до 31 декабря 2026. */
const peakDate = () => new Date(2026, 11, 31, 12);
const dayOneDate = () => new Date(2026, 11, 30, 12);
const daySixteenDate = () => new Date(2026, 11, 15, 12);

/** Кадр через контракт — тот же путь, что на странице. */
function calendarFrame(dateAt, { width = 1280, height = 800, t = 0, progressAt = null } = {}) {
  const contract = createSceneContract();
  const handle = registerCalendar(contract, dateAt, progressAt);
  const ctx = createMockCtx();
  contract.draw(ctx, width, height, t);
  return { contract, handle, ctx };
}

const stopColors = (ctx) => callsNamed(ctx, 'addColorStop').map((call) => call.args[1]);
const arcCenters = (ctx) => callsNamed(ctx, 'arc').map((call) => [call.args[0], call.args[1]]);
const arcRadii = (ctx) => callsNamed(ctx, 'arc').map((call) => call.args[2]);
/** Градиент сияния всей ёлки узнаём по внутреннему радиусу 8, как в garland. */
const treeGlowGradients = (ctx) =>
  callsNamed(ctx, 'createRadialGradient').filter((call) => call.args[2] === 8);

test('starBrightness: 0 вне окна, 1 в пик, строго монотонно на 31→0', () => {
  for (const days of [32, 38, 364, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(starBrightness(days), 0, `${days} дней — звезда не разгорается`);
  }
  assert.ok(starBrightness(STAR_WINDOW_DAYS) > 0, 'за 31 день уже видна');
  assert.ok(starBrightness(STAR_WINDOW_DAYS) < 1, 'но ещё не пик');
  assert.equal(starBrightness(0), 1, '31 декабря — ровно 1');

  for (let days = 0; days < STAR_WINDOW_DAYS; days += 1) {
    assert.ok(
      starBrightness(days) > starBrightness(days + 1),
      `${days} дней ярче, чем ${days + 1}`,
    );
  }
  for (let days = -5; days <= 365; days += 1) {
    const value = starBrightness(days);
    assert.ok(value >= 0 && value <= 1, `${days} → ${value} в границах 0..1`);
  }
  assert.equal(starBrightness(undefined), 0, 'невалидный остаток не ломает кадр');
});

test('isPeakDay: правда только для нуля дней', () => {
  assert.equal(isPeakDay(0), true);
  for (const days of [-1, 1, 2, 30, 31, 32, 364, Number.NaN]) {
    assert.equal(isPeakDay(days), false, `${days} — не пик`);
  }
});

test('кадр с фиксированной датой: радиальные градиенты и дуги, без fillRect', () => {
  const { ctx, handle } = calendarFrame(daySixteenDate);
  assert.equal(handle.daysLeft, 16);
  assert.ok(Math.abs(handle.brightness - starBrightness(16)) < 1e-12);

  assert.equal(callsNamed(ctx, 'fillRect').length, 0, 'объект сцены не рисует прямоугольники');
  const arcs = callsNamed(ctx, 'arc');
  const gradients = callsNamed(ctx, 'createRadialGradient');
  assert.ok(arcs.length >= 10, 'ореол + восемь лепестков + ядро');
  assert.equal(gradients.length, arcs.length, 'каждая дуга залита своим градиентом');
  assert.ok(arcs.every((call) => Math.abs(call.args[4] - Math.PI * 2) < 1e-12), 'дуги полные');

  // Блик верх-слева: у объёмных дисков внутренний круг градиента смещён
  // влево-вверх от центра (у симметричного ореола смещения нет).
  assert.ok(
    gradients.some((call) => call.args[0] < call.args[3] && call.args[1] < call.args[4]),
    'есть блик upper-left',
  );
  assert.ok(
    stopColors(ctx).includes('#fffdf1'),
    'ядро начинается со светлого блика',
  );
});

test('пик 31 декабря: сияние всей ёлки добавляется, за день до пика — нет', () => {
  const peak = calendarFrame(peakDate).ctx;
  const before = calendarFrame(dayOneDate).ctx;

  for (const [, color] of GARLAND_GLOW_STOPS) {
    assert.ok(stopColors(peak).includes(color), `в пик есть стоп ${color}`);
    assert.ok(!stopColors(before).includes(color), `за день до пика нет стопа ${color}`);
  }
  assert.equal(treeGlowGradients(peak).length, 1, 'один градиент сияния всей ёлки');
  assert.equal(treeGlowGradients(before).length, 0, 'обычный день не добавляет сияние');
  const glow = treeGlowGradients(peak)[0];
  assert.ok(glow.args[5] > 100, 'радиус покрывает ёлку');
  assert.ok(
    arcRadii(peak).some((radius) => Math.abs(radius - glow.args[5]) < 1e-9),
    'сияние — круглый градиентный силуэт, а не fillRect',
  );
  assert.equal(callsNamed(peak, 'fillRect').length, 0);

  // Радиус ореола звезды растёт с яркостью: пик светлее дня 1. У пика
  // самый большой градиент — сияние ёлки (внутренний радиус 8), его и
  // исключаем, чтобы сравнить именно ореол звезды.
  const glowR = (ctx) => Math.max(
    ...callsNamed(ctx, 'createRadialGradient')
      .filter((call) => call.args[2] !== 8)
      .map((call) => call.args[5]),
  );
  assert.ok(glowR(peak) > glowR(before), 'ореол в пик больше');
});

test('тёмная фаза: звезда не рисуется даже 31 декабря', () => {
  const dark = calendarFrame(peakDate, {
    progressAt: () => ({ layers: { tree: 0 } }),
  });
  assert.equal(dark.contract.size, 1, 'объект зарегистрирован');
  assert.equal(dark.handle.daysLeft, 0, 'дата всё равно читается');
  assert.equal(dark.handle.brightness, 1);
  assert.equal(callsNamed(dark.ctx, 'arc').length, 0, 'ни одного силуэта');
  assert.equal(callsNamed(dark.ctx, 'createRadialGradient').length, 0);
  assert.equal(callsNamed(dark.ctx, 'fillRect').length, 0);

  const rising = calendarFrame(peakDate, {
    progressAt: () => ({ layers: { tree: 0.5 } }),
  });
  assert.ok(callsNamed(rising.ctx, 'arc').length > 0, 'с ёлкой звезда проявляется');
});

test('registerCalendar: ровно одна регистрация слоя 21, хэндл читает дату', () => {
  const registrations = [];
  let current = dayOneDate();
  const contract = {
    register(draw, options) {
      registrations.push({ draw, options });
    },
  };
  const handle = registerCalendar(contract, () => current);

  assert.equal(registrations.length, 1, 'вторая регистрация не нужна');
  assert.equal(registrations[0].options.layer, CALENDAR_LAYER);
  assert.equal(CALENDAR_LAYER, 21, 'слой 21 выше гирлянды (20)');
  assert.equal(typeof registrations[0].draw, 'function');
  assert.equal(handle.daysLeft, 1);
  assert.equal(handle.brightness, starBrightness(1));

  const ctx = createMockCtx();
  registrations[0].draw(ctx, 1280, 800, 0);
  assert.equal(handle.daysLeft, 1, 'кадр обновил хэндл той же датой');

  current = peakDate();
  registrations[0].draw(ctx, 1280, 800, 0);
  assert.equal(handle.daysLeft, 0, 'смена даты видна без перезагрузки');
  assert.equal(handle.brightness, 1);
});

test('ресайз: все позиции и радиусы звезды остаются пропорциональными', () => {
  const big = calendarFrame(daySixteenDate, { width: 1280, height: 800 }).ctx;
  const small = calendarFrame(daySixteenDate, { width: 640, height: 400 }).ctx;
  const bigCenters = arcCenters(big);
  const smallCenters = arcCenters(small);
  const bigRadii = arcRadii(big);
  const smallRadii = arcRadii(small);

  assert.equal(smallCenters.length, bigCenters.length, 'тот же набор силуэтов');
  for (let i = 0; i < bigCenters.length; i += 1) {
    assert.ok(
      Math.abs(bigCenters[i][0] / 1280 - smallCenters[i][0] / 640) < 1e-9,
      `дуга ${i}: x пропорционален ширине`,
    );
    assert.ok(
      Math.abs(bigCenters[i][1] / 800 - smallCenters[i][1] / 400) < 1e-9,
      `дуга ${i}: y пропорционален высоте`,
    );
    assert.ok(
      Math.abs(bigRadii[i] / 2 - smallRadii[i]) < 1e-9,
      `дуга ${i}: радиус масштабируется`,
    );
  }
  // Звезда висит над верхушкой ёлки: top = 0.8h − min(0.44h, 0.34w).
  const top = 800 * 0.8 - Math.min(800 * 0.44, 1280 * 0.34);
  assert.ok(bigCenters.every(([, y]) => y <= top), 'центры деталей выше верхушки');
});

test('пульсация по t детерминирована и остаётся мягкой', () => {
  const first = calendarFrame(daySixteenDate, { t: 1000 }).ctx;
  const repeat = calendarFrame(daySixteenDate, { t: 1000 }).ctx;
  assert.deepEqual(
    callsNamed(first, 'createRadialGradient').map((call) => call.args),
    callsNamed(repeat, 'createRadialGradient').map((call) => call.args),
    'тот же t — те же градиенты',
  );

  const other = calendarFrame(daySixteenDate, { t: 19000 }).ctx;
  const radiusAt = (ctx) => callsNamed(ctx, 'createRadialGradient')[0].args[5];
  const drift = Math.abs(radiusAt(other) - radiusAt(first)) / radiusAt(first);
  assert.ok(drift > 0 && drift < 0.05, `изменение ореола ${drift} — дыхание, а не мигание`);
});

test('drawCalendarStar: brightness 0 — пустой кадр (до окна 31 дня)', () => {
  const ctx = createMockCtx();
  drawCalendarStar(ctx, 1280, 800, 38, 0);
  assert.equal(ctx.calls.length, 0, 'за 38 дней звезды ещё нет');
});
