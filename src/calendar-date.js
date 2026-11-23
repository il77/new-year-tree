// Чистая арифметика новогоднего отсчёта (tracer bullet epic-calendar).
// Никакого DOM, таймеров и глобального состояния: дата приходит аргументом,
// поэтому поведение проверяется node:test на фиксированных датах.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Недействительная дата не должна ломать страницу — берём текущую. */
function asDate(now) {
  return now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
}

/**
 * Сколько дней осталось до 31 декабря локального года выбранной даты.
 * Считаем по локальным календарным датам, переводя их в UTC-полночь:
 * разница тогда точна и не зависит от перехода на летнее время.
 *
 * @param {Date} [now] дата (по умолчанию — текущая локальная)
 * @returns {number} целое >= 0; 31 декабря — ровно 0
 */
export function daysUntilNewYear(now = new Date()) {
  const date = asDate(now);
  const year = date.getFullYear();
  const today = Date.UTC(year, date.getMonth(), date.getDate());
  const newYearEve = Date.UTC(year, 11, 31);
  return Math.max(0, Math.round((newYearEve - today) / MS_PER_DAY));
}

/**
 * Русское склонение для числа дней: 1 день, 2 дня, 5 дней, 21 день, 22 дня.
 *
 * @param {number} n число дней
 * @returns {string} например «1 день» или «0 дней»
 */
export function formatDaysLeft(n) {
  const days = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  const last = days % 10;
  const lastTwo = days % 100;

  let word = 'дней';
  if (last === 1 && lastTwo !== 11) word = 'день';
  else if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) word = 'дня';

  return `${days} ${word}`;
}
