// DOM-слой счётчика дней: только поиск элемента и запись текста.
// Документ и дата приходят аргументами — тесты работают на стабах без jsdom.

import { daysUntilNewYear, formatDaysLeft } from './calendar-date.js';

/**
 * Показывает отсчёт в #calendar-counter. Отсутствие элемента (или самого
 * документа) — тихий no-op: страница без разметки не должна падать.
 *
 * @param {Document} doc документ с элементом #calendar-counter
 * @param {Date} [now] дата для отсчёта (по умолчанию — текущая локальная)
 * @returns {void}
 */
export function updateCalendarCounter(doc, now = new Date()) {
  const counter =
    doc && typeof doc.getElementById === 'function'
      ? doc.getElementById('calendar-counter')
      : null;
  if (!counter) return;
  counter.textContent = `${formatDaysLeft(daysUntilNewYear(now))} до Нового года 🎄`;
}
