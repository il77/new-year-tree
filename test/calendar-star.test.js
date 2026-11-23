// Календарная звезда (epic-calendar, story 2): кривая яркости 31→0, пик
// 31 декабря, объёмный гладкий кадр (R12), тёмная фаза и регистрация на
// общем контракте слоем 21. node:test + общий мок-ctx, без jsdom/зависимостей.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMockCtx, callsNamed } from '../scripts/mock-ctx.js';
import { createSceneContract } from '../src/contract.js';
import {
  GARLAND_GLOW_COUNT,
  GARLAND_GLOW_INNER_RADIUS,
  GARLAND_GLOW_STOPS,
  registerGarland,
} from '../src/garland.js';
import {
  CALENDAR_LAYER,
  STAR_BASE_BRIGHTNESS,
  STAR_MIN_BRIGHTNESS,
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

/** Кадр вместе с реальной гирляндой — проверяет один glow в пик. */
function integratedFrame(dateAt, { count = 12, seed = 7, progressAt = null } = {}) {
  const contract = createSceneContract();
  const garland = registerGarland(contract, seed, progressAt, {
    count,
    tens: Math.floor(count / 10),
    remainder: count % 10,
    seed,
  });
  const handle = registerCalendar(contract, dateAt, progressAt, garland);
  const ctx = createMockCtx();
  contract.draw(ctx, 1280, 800, 0);
  return { contract, handle, garland, ctx };
}

const stopColors = (ctx) => callsNamed(ctx, 'addColorStop').map((call) => call.args[1]);
const arcCenters = (ctx) => callsNamed(ctx, 'arc').map((call) => [call.args[0], call.args[1]]);
const arcRadii = (ctx) => callsNamed(ctx, 'arc').map((call) => call.args[2]);
/** Градиент сияния всей ёлки узнаём по общему маркеру из garland.js. */
const treeGlowGradients = (ctx) =>
  callsNamed(ctx, 'createRadialGradient').filter(
    (call) => call.args[2] === GARLAND_GLOW_INNER_RADIUS,
  );

test('starBrightness: базовый свет вне окна, 1 в пик, рост на 31→0', () => {
  for (const days of [32, 38, 364]) {
    assert.equal(starBrightness(days), STAR_BASE_BRIGHTNESS, `${days} дней — тихий базовый свет`);
  }
  for (const days of [Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
    assert.equal(starBrightness(days), 0, 'невалидный остаток не ломает кадр');
  }
  assert.ok(STAR_BASE_BRIGHTNESS > 0 && STAR_BASE_BRIGHTNESS < STAR_MIN_BRIGHTNESS);
  assert.equal(starBrightness(STAR_WINDOW_DAYS), STAR_MIN_BRIGHTNESS, 'за 31 день уже ярче');
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
  assert.ok(arcs.length >= 5, 'ореол, лепестки и ядро — одни дуги');
  assert.equal(gradients.length, arcs.length, 'каждая дуга залита своим градиентом');
  assert.ok(arcs.every((call) => Math.abs(call.args[4] - Math.PI * 2) < 1e-12), 'дуги полные');

  // Блик верх-слева: у объёмных дисков внутренний круг градиента смещён
  // влево-вверх от центра (у симметричного ореола смещения нет).
  assert.ok(
    gradients.some((call) => call.args[0] < call.args[3] && call.args[1] < call.args[4]),
    'есть блик upper-left',
  );
  assert.ok(
    stopColors(ctx).some((color) => typeof color === 'string' && /^#fff|255, 252/.test(color)),
    'ядро начинается со светлого блика',
  );
});

test('пик 31 декабря: сияние ёлки включает гирлянда, за день — нет', () => {
  const peak = integratedFrame(peakDate).ctx;
  const before = integratedFrame(dayOneDate).ctx;

  for (const [, color] of GARLAND_GLOW_STOPS) {
    assert.ok(stopColors(peak).includes(color), `в пик есть стоп ${color}`);
    assert.ok(!stopColors(before).includes(color), `за день до пика нет стопа ${color}`);
  }
  assert.equal(treeGlowGradients(peak).length, 1, 'один градиент сияния всей ёлки');
  assert.equal(treeGlowGradients(before).length, 0, 'обычный день не добавляет сияние');
  assert.equal(callsNamed(peak, 'fillRect').length, 0);

  // Ореол звезды в пик больше, чем за день: сравниваем только градиенты
  // звезды, сияние ёлки отмечено общим внутренним радиусом.
  const glowR = (ctx) => Math.max(
    ...callsNamed(ctx, 'createRadialGradient')
      .filter((call) => call.args[2] !== GARLAND_GLOW_INNER_RADIUS)
      .map((call) => call.args[5]),
  );
  assert.ok(glowR(peak) > glowR(before), 'ореол в пик больше');
});

test('пик + 300 визитов: ровно одно сияние и общий rise ритуала', () => {
  const highPeak = integratedFrame(peakDate, { count: GARLAND_GLOW_COUNT });
  assert.equal(treeGlowGradients(highPeak.ctx).length, 1, 'нет дубля glow поверх огоньков');
  assert.equal(highPeak.garland.peakGlow, true);

  const highBefore = integratedFrame(dayOneDate, { count: GARLAND_GLOW_COUNT });
  assert.equal(treeGlowGradients(highBefore.ctx).length, 1, 'при 300 glow уже есть');
  assert.equal(highBefore.garland.peakGlow, false);

  const partial = integratedFrame(peakDate, {
    count: 12,
    progressAt: () => ({ layers: { tree: 0.5 } }),
  });
  assert.equal(treeGlowGradients(partial.ctx).length, 1, 'glow рисуется и при неполной ёлке');
  assert.ok(callsNamed(partial.ctx, 'arc').length > 0, 'звезда тоже есть');

  const dark = integratedFrame(peakDate, {
    count: 12,
    progressAt: () => ({ layers: { tree: 0 } }),
  });
  assert.equal(dark.ctx.calls.length, 0, 'тёмная фаза не рисует ни glow, ни звезду');
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

test('ритуал: звезда опускается вместе с ёлкой и гаснет по альфе', () => {
  const full = calendarFrame(daySixteenDate).ctx;
  const partial = calendarFrame(daySixteenDate, {
    progressAt: () => ({ layers: { tree: 0.5 } }),
  }).ctx;

  const firstArcY = (ctx) => callsNamed(ctx, 'arc')[0].args[1];
  assert.ok(firstArcY(partial) > firstArcY(full), 'звезда следует за rise ёлки');
  assert.ok(
    callsNamed(partial, 'globalAlpha').some((call) => call.args[0] === 0.5),
    'альфа звезды равна прогрессу ёлки',
  );
  assert.ok(callsNamed(full, 'globalAlpha').some((call) => call.args[0] === 1));
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

test('registerCalendar: смена дня обновляет DOM-счётчик и флаг пика гирлянды', () => {
  const peakFlags = [];
  const changedDays = [];
  const fakeGarland = { setPeakGlow: (on) => peakFlags.push(on) };
  let current = dayOneDate();
  const contract = createSceneContract();
  registerCalendar(contract, () => current, null, fakeGarland, (days) => changedDays.push(days));

  assert.deepEqual(peakFlags, [false], 'начальное состояние пика выставлено при регистрации');
  const ctx = createMockCtx();
  contract.draw(ctx, 1280, 800, 0);
  assert.deepEqual(changedDays, [], 'тот же день — лишнего обновления нет');

  current = peakDate();
  contract.draw(ctx, 1280, 800, 0);
  assert.deepEqual(changedDays, [0], 'смена дня дошла до счётчика');
  assert.deepEqual(peakFlags, [false, true], 'пик гирлянды включён один раз');
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
  // Инвариант, а не копия формулы: звезда висит в верхней части кадра.
  assert.ok(bigCenters.every(([, y]) => y < 800 * 0.45), 'звезда выше верхушки ёлки');
  assert.ok(smallCenters.every(([, y]) => y < 400 * 0.45), 'то же на малом кадре');
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
  assert.ok(drift > 0 && drift < 0.1, `изменение ореола ${drift} — дыхание, а не мигание`);
});

test('drawCalendarStar: вне окна звезда тусклая, но присутствует', () => {
  const far = createMockCtx();
  drawCalendarStar(far, 1280, 800, 38, 0);
  assert.ok(callsNamed(far, 'arc').length > 0, 'за 38 дней звезда уже видна');
  assert.equal(callsNamed(far, 'fillRect').length, 0);

  const near = createMockCtx();
  drawCalendarStar(near, 1280, 800, 16, 0);
  const maxRadius = (ctx) => Math.max(...callsNamed(ctx, 'createRadialGradient').map((c) => c.args[5]));
  assert.ok(maxRadius(near) > maxRadius(far), 'ближе к Новому году ореол больше');

  const invalid = createMockCtx();
  drawCalendarStar(invalid, 1280, 800, Number.NaN, 0);
  assert.equal(invalid.calls.length, 0, 'невалидная дата не ломает кадр');
});
