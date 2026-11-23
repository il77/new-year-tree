---
title: 'Рост яркости звезды и пик 31 декабря'
type: feature
ticket: '2'
created: '2026-11-23'
status: built
baseline_revision: '297ad2f'
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [requirements, regressions]
review_loop_iteration: 0
context: ["docs/contract.md", "docs/style.md", "src/garland.js", "src/world.js"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Без календарной механики звезда не связана с отсчётом, а 31 декабря не происходит обещанного максимума: звезда и сияние ёлки должны достигать пика одновременно, без дублирования эффекта epic-garland и без рассинхрона с ритуалом.

**Approach:** Непрерывная яркость от остатка дней (0–31, максимум в 0) управляет одним объёмным гладким объектом слоя 21; в пик календарь переключает `setPeakGlow()` уже зарегистрированной гирлянды, поэтому glow рисуется один раз в её слое 20 под огоньками. Вне окна 31 дня звезда держит тихий базовый свет; геометрия и альфа следуют за `rise`/прогрессом ёлки. Смена суток обновляет счётчик через `onDayChange` без сети и нового таймера; поведение проверяется подстановкой даты.

**Decision (2026-11-23, by human):** Слой звезды 21 зафиксирован по фактической регистрации; контракт и гирлянда не меняются. Живая двухбраузерная проверка перенесена в 4.5 решением «Дострой всё, проверю в конце» — здесь она не заявлена.

## Boundaries & Constraints

**Always:** ноль зависимостей, Node 22+, `node:test`; база — `baseline_revision` выше (включает исправления двух ревью); ровно одна регистрация на контракте, один glow в пик, детерминированные кадры по `(date, t)`; контракт рендера, `setState` гирлянды, порог 300 и слои 6/9/10/15/20 не меняются.

**Never:** не дублировать `drawGlow` гирлянды в слое 21; не подменять `setPeakGlow()` подстановкой `count: 300`; не добавлять rAF, интервал, сеть, `Math.random` и живой браузерный результат; не изображать пик за день до 31 декабря.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Кривая | 38 / 31 / 10 / 1 / 0 дней | 0.04 / 0.08 → 1, монотонно; пик только при 0 | Невалидное число → 0 |
| Пик + визиты | 31.12, `count >= 300` | Ровно один glow в гирлянде, под огоньками, общий `rise` | Без второго градиента слоем 21 |
| Ритуал | `tree <= 0` и `0 < tree < 1` | Нет кадра / звезда опущена и гаснет вместе с ёлкой | `save/try/finally/restore` |
| Смена дня | дата изменилась в открытой вкладке | `onDayChange` обновляет DOM, флаг пика переключается | Без сети и нового таймера |
| Ресайз | 1280×800 → 640×400 | Позиции и радиусы пропорциональны | — |

</frozen-after-approval>

## Code Map

- `src/calendar-star.js` — `CALENDAR_LAYER = 21`, `STAR_WINDOW_DAYS = 31`, `STAR_BASE_BRIGHTNESS = 0.04`, `STAR_MIN_BRIGHTNESS = 0.08`, `STAR_LOBES`; `starBrightness`, `isPeakDay`, `starGeometry(rise)`, `drawCalendarStar(ctx,w,h,daysLeft,t,treeAlpha)`, `registerCalendar(contract,dateAt,progressAt,garland,onDayChange)`.
- `src/garland.js:223–260` — хэндл `setPeakGlow(on)`; glow остаётся в слое гирлянды 20 с общим `rise`, `setState` не тронут.
- `src/main.js:258–268` — `registerCalendar(page.contract, () => new Date(), progressAt, garland, () => updateCalendarCounter(document))`; ровно один объект, дата читается каждый кадр.
- `test/calendar-star.test.js` — кривая, пик, `count >= 300`, тёмная фаза, ритуал, смена дня, ресайз, детерминированная пульсация; тесты переписаны на инварианты.
- `test/calendar-date.test.js` — смена разметки проверяется по инвариантам после исправления хрупкого теста.

## Tasks & Acceptance

**Execution:**
- [x] `src/calendar-star.js` -- кривая 31→0, базовый свет и один мягкий объект -- звезда видна в любую дату.
- [x] `src/garland.js` -- `setPeakGlow()` в хэндле -- пик рисуется один раз в слое 20.
- [x] `src/calendar-star.js` -- `rise` и альфа от прогресса ёлки, `onDayChange` -- нет отрыва от верхушки и залипания счётчика.
- [x] `src/main.js` -- передать `garland` и колбэк счётчика в `registerCalendar` -- без новых циклов.
- [x] `test/calendar-star.test.js`, `test/calendar-date.test.js` -- заменить хрупкие asserts на инварианты и покрыть пик/ритуал -- 297ad2f зелёный.

**Acceptance Criteria:**
- Given остаток 38/31/10/1/0 дней, when взята `starBrightness`, then 0.04 / 0.08 → 1 монотонно и ровно 1 в пик.
- Given 31 декабря и `count >= 300`, when отрисован кадр, then `setPeakGlow(true)` гирлянды даёт один glow в слое 20, общего `rise`; слой 21 его не дублирует.
- Given частичный ритуал, when `tree < 1`, then звезда и glow следуют за сдвигом ёлки; при `tree <= 0` кадра нет.
- Given смена даты без сети, when наступил новый день, then DOM-счётчик и флаг пика обновлены без нового таймера.

## Implementation Notes

- `starBrightness(daysLeft)`: `> 31` → `STAR_BASE_BRIGHTNESS`; внутри окна — `STAR_MIN_BRIGHTNESS + (1 − STAR_MIN_BRIGHTNESS) · (1 − days/31)`; `isPeakDay` — строго `daysLeft === 0`.
- `drawCalendarStar()` — радиальные градиенты и `arc` по `STAR_LOBES`, блик upper-left, `save → try → finally restore`; никаких `fillRect` и жёстких обводок по `docs/style.md`.
- `registerCalendar()` переключает `garland.setPeakGlow()` только при изменении флага и вызывает `onDayChange(daysLeft)` только при смене дня; дата берётся из `dateAt()` в каждом кадре.
- `src/garland.js` получил `peakGlow` и `setPeakGlow` в возвращаемом хэндле; `setState`, seed, порог 300 и форма ответа `/api/visit` не тронуты.
- В 297ad2f убрано дублирующее сияние слоем 21, добавлены базовый свет, `rise`/альфа и обновление по смене дня; тесты разметки и звезды переписаны на инварианты. Живая проверка не выполнялась — шаг человека в 4.5.

## Plan Change Log

- 2026-11-23 — план создан по состоянию 297ad2f (396fc4a + явные исправления после двух независимых ревью); статус `built`, живой шаг остаётся в 4.5.

## Review Triage Log

Итог двух независимых линз (requirements, regressions), дубли объединены: `medium` 3, `low` 2, `false` 1; все подтверждённые находки исправлены в `297ad2f`, отложенных нет.

- **medium** — пик 31 декабря рисовал второй glow в слое 21 (`src/calendar-star.js`, копия стопов `GARLAND_GLOW_STOPS`); при `count >= 300` получались два градиента и рассинхрон с гирляндой. Finding: нарушение требования «включать пик через хэндл гирлянды, не дублируя epic-garland». Fix: `setPeakGlow()` в `registerGarland`, glow только в слое 20 под огоньками, общий `rise`; `setState({count:300})` не применялся, чтобы не пересчитать `tens/remainder`. Evidence: `297ad2f`, тест «пик + 300 визитов: ровно одно сияние и общий rise ритуала».
- **medium** — звезда не учитывала `rise` и альфу ритуала: при `tree < 1` она отрывалась от верхушки и сразу горела полной яркостью. Finding: рассинхрон с `src/world.js` и `src/garland.js`. Fix: `treeAlpha` в `drawCalendarStar`, `rise = (1 − treeAlpha) · h · 0.015`, `ctx.globalAlpha = treeAlpha`, отказ кадра при `tree <= 0`. Evidence: `297ad2f`, тест «ритуал: звезда опускается вместе с ёлкой и гаснет по альфе».
- **medium** — звезда отсутствовала 334 дня в году (ранний возврат при остатке > 31). Finding: нарушение критерия story 1 «звезда на верхушке в любую дату». Fix: `STAR_BASE_BRIGHTNESS = 0.04` вне окна, `STAR_MIN_BRIGHTNESS = 0.08` на границе. Evidence: `297ad2f`, тест «drawCalendarStar: вне окна звезда тусклая, но присутствует».
- **low** — инъецируемый `today` не использовался при обновлении счётчика; при смене суток без сети текст расходился со звездой. Fix: `onDayChange` в `registerCalendar`, вызов `updateCalendarCounter(document)` только при смене дня. Evidence: `297ad2f`, тест «registerCalendar: смена дня обновляет DOM-счётчик и флаг пика гирлянды».
- **low** — хрупкие тесты разметки и звезды зашивали точные CSS-значения, число дуг, конкретный цвет, магические числа из `garland.js` и форму геометрии. Fix: проверки инвариантов (наличие элемента, fixed, `pointer-events: none`, нет `fillRect`, монотонность, блик upper-left, пропорции); добавлены тесты невалидной даты. Evidence: `297ad2f`.
- **false** — замечание «слой 21 вместо 25»: относительный порядок 21 > 20 > 15 корректен, код менять не нужно. Fix: синхронизированы формулировки эпика и тикетов. Evidence: `a845297`, `297ad2f`.
