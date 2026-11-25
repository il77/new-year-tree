---
title: 'Счётчик дней и звезда на сцене'
type: feature
ticket: '1'
created: '2026-11-23'
status: done
baseline_revision: '4b302c3'
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [requirements, regressions]
review_loop_iteration: 0
context: ["docs/contract.md", "docs/style.md", "index.html", "src/main.js"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Календарь — скелет концепции: при открытии страницы в любую дату сверху должен быть виден корректный отсчёт дней, не мешающий ритуалу первого входа. Нужна тонкая линия от чистой арифметики даты до DOM и контракта рендера, пригодная для story 2.

**Approach:** Tracer: чистая функция остатка дней по локальной дате, русское склонение, тихий DOM-элемент `#calendar-counter` в разметке и вызов обновления в `bootstrap()` до первого кадра. Дата инъецируется аргументом, поэтому проверки работают подстановкой без браузера; новых циклов, таймеров и зависимостей нет. Объект звезды слоя 21 регистрируется через существующий контракт; фактически он появился в story 2 (`396fc4a`, исправлен `297ad2f`) — см. Implementation Notes.

**Decision (2026-11-23, by human):** «Дострой всё, проверю в конце» — живая проверка в двух браузерах сознательно перенесена в последнюю story epic-world (4.5). Локальный запуск стартера и открытие страницы тоже отложены до этой финальной проверки: в 3.1 нет ни браузерной проверки, ни датированной записи, `hitl` в тикете снят (`false`).

## Boundaries & Constraints

**Always:** ноль зависимостей, Node 22+, `node:test`; база — `baseline_revision` выше; дата приходит аргументом; текст виден в первом кадре; тап ритуала не перехватывается; контракт рендера, ритуал, счётчик визитов и слои 5/8/10/20 не меняются.

**Never:** не менять движок, форму `/api/visit` и архитектуру сцены; не добавлять rAF, интервал, сеть и `Math.random`; не выдумывать живую проверку в двух браузерах и датированную запись человека; не переносить сюда кривую яркости и пик story 2.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Отсчёт | 31.12, 30.12, 1 января високосного/обычного года | 0, 1, 365/364 дня, целое ≥ 0 | Невалидная `Date` → текущая дата |
| Склонение | 0/1/2/5/11/21/22 | «0 дней», «1 день», «2 дня», … | Нечисло → 0 |
| DOM | элемент есть / нет, `doc` пустой | Текст «N дней до Нового года 🎄» / тихий no-op | Без исключения |
| Первый paint | `bootstrap(doc, win, contract, today)` | Счётчик заполнен до первого кадра | Без нового rAF/таймера |

</frozen-after-approval>

## Code Map

- `src/calendar-date.js` (новый в 4b302c3) — `MS_PER_DAY`, `asDate`, `daysUntilNewYear(now)`, `formatDaysLeft(n)`; локальные календарные даты через `Date.UTC`, DST-safe.
- `src/calendar-counter.js` (новый) — `updateCalendarCounter(doc, now)`, поиск `#calendar-counter`, запись `textContent`, no-op без элемента.
- `index.html:29–45,106` — стиль `#calendar-counter` (`position: fixed`, `top: 1.2rem`, `pointer-events: none`) и `<p id="calendar-counter">—</p>` перед `<canvas id="scene">`.
- `src/main.js:16,33–44,274–281` — импорт и вызов `updateCalendarCounter(doc, today)` в `bootstrap(..., today)`; обновление при синхронизации визита; после `297ad2f` обновление по смене дня через `registerCalendar`.
- `test/calendar-date.test.js` — дата, склонение, DOM-стабы, разметка и bootstrap-харнесс; хрупкая проверка точных стилей заменена на инварианты в `297ad2f`.
- `src/calendar-star.js` — звезда и её регистрация появились в `396fc4a`/`297ad2f`, в базовом коммите 4b302c3 их нет.

## Tasks & Acceptance

**Execution:**
- [x] `src/calendar-date.js` -- чистый отсчёт и склонение с инъецируемой датой -- tracer без DOM и таймеров.
- [x] `src/calendar-counter.js` -- DOM-слой с тихим no-op -- страница без разметки не падает.
- [x] `index.html` -- `#calendar-counter` сверху, `pointer-events: none` -- жест ритуала остаётся свободным.
- [x] `src/main.js` -- вызов до первого кадра и в `applyVisit` -- текст актуален без нового цикла.
- [x] `test/calendar-date.test.js` -- дата, склонение, DOM, bootstrap -- 4b302c3 зелёный; хрупкие asserts relaxed в 297ad2f.

**Acceptance Criteria:**
- Given подставленная дата, when вызван `daysUntilNewYear`, then 31.12 → 0, 30.12 → 1, 1 января → 364/365; невалидная дата не ломает кадр.
- Given `#calendar-counter`, when вызван `updateCalendarCounter`, then текст «N дней до Нового года 🎄»; без элемента — no-op.
- Given загруженная страница, when она впервые отрисована, then счётчик уже заполнен, сверху и не перехватывает тап.
- Given живой сайт, when человек откроет его в двух браузерах, then запись датирует он сам в story 4.5; агентом здесь проверка не заявлена.

## Implementation Notes

- `MS_PER_DAY = 24*60*60*1000`; `daysUntilNewYear()` считает разницу UTC-полуночей локальных дат, `Math.round` защищает от DST; `formatDaysLeft()` корректно склоняет 1/2/5/11/21/22.
- `updateCalendarCounter()` пишет `${formatDaysLeft(daysUntilNewYear(now))} до Нового года 🎄`; `bootstrap(doc, win, contract = sceneContract, today = new Date())` добавил четвёртый аргумент только для тестов.
- Стиль в `index.html`: `position: fixed`, `top: 1.2rem`, `text-align: center`, `font-family: Georgia`, `pointer-events: none`; счётчик расположен до `<canvas>`, но видимость обеспечивается fixed-позиционированием.
- Звезда как объект контракта (`CALENDAR_LAYER = 21`) зарегистрирована в `396fc4a` и доведена до итогового состояния в `297ad2f`; 4b302c3 — только tracer даты/DOM. План не приписывает базовому коммиту то, что сделано следующим.
- Локально в цепочке коммитов: тесты даты и сборка зелёные; локальный запуск стартера и живая двухбраузерная проверка сознательно отложены до 4.5 и здесь не заявлены.

## Plan Change Log

- 2026-11-23 — план создан по факту коммита 4b302c3; frozen Intent сохранён из breakdown; состояние `built`, живой шаг перенесён в 4.5 решением человека.

## Review Triage Log

Две независимые линзы календаря (requirements, regressions) дали находки, относящиеся к 3.1; дубли объединены. Итог: `medium` 1, `low` 2, `false` 1; все подтверждённые исправлены в `297ad2f`, отложенного нет.

- `src/main.js:42,261–267` — счётчик обновлялся только в `applyVisit` после успешного ответа; при смене суток без сети текст мог залипнуть. Verdict: **low**, подтверждено — звезда читает дату каждый кадр, DOM — нет. Fix: `registerCalendar(..., onDayChange)` обновляет DOM при смене дня без сети и без нового таймера. Evidence: `297ad2f`.
- `test/calendar-date.test.js:88–102` — тест зашивал точные `top: 1.2rem`, `font-family: Georgia` и порядок DOM; безвредный визуальный твик ломал его. Verdict: **low**, подтверждено. Fix: проверяются наличие элемента, `position: fixed`, `pointer-events: none`. Evidence: `297ad2f`.
- `src/calendar-star.js:12` против `epic-calendar.md:40` — в тексте эпика слои звезды значился 25, в коде 21. Verdict: **false** для кода — относительный порядок (21 выше 20/15) корректен; Fix: синхронизирован текст эпика и тикетов, код не менялся. Evidence: `a845297`, `297ad2f`.

Находки по звезде (дубль glow, base brightness, rise) относятся к story 3.2 и записаны в её плане. Живая проверка сознательно не заявлена: решение человека 2026-11-23 «Дострой всё, проверю в конце», шаг перенесён в 4.5.
