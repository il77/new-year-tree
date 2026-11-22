---
title: 'Refactor sweep'
type: refactor
ticket: '6'
created: '2026-11-22'
status: done
baseline_revision: 'c332d91'
route: full
route_source: auto
risk: low
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** За пять сторис накопился мусор: мок-2D-контекст продублирован в пяти тестах (три копии байт-в-байт), в `src/world.js` импорт из `ritual.js` стоит посреди файла, радиальный блик скопирован трижды, `src/scene.js` дважды считает x искры, README описывает страницу до живой сцены 1.5.

**Approach:** Чистая уборка без изменения поведения, API и утверждений тестов: общий `test/support.js` для мока, импорт в шапку, helper блика с тем же порядком вызовов, единый источник x искры, правдивое «Ожидание» в README.

## Boundaries & Constraints

**Always:** кадр даёт те же вызовы ctx в том же порядке и с теми же аргументами; 43/43 тестов зелёные без ослабления; `npm run build` exit 0; ноль зависимостей; `RITUAL_TIMING`, слои, контракт `(ctx, w, h, t)` и API `bootstrap` не меняются; R12-стиль не трогается.

**Never:** новая функциональность, новые тесты, переносы из других эпиков; переписывание тел `test(...)` (только удаление дублей и импорт); изменение таймингов, амплитуд, цветов, геометрии; git-операции.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Тесты и сборка | `npm test`, `npm run build` | 43/43 exit 0; build exit 0 | — |
| Общий мок | импорт из `scripts/mock-ctx.js` | те же `calls`, градиенты с `addColorStop`, `globalAlpha` с геттером/сеттером; методы пишут только при вызове | — |
| Кадр | `renderFrame` при `t = 0` и `t > 0`, с ритуалом и без | последовательность вызовов идентична прежней (блик и x искры) | — |
| README | раздел «Локальный запуск» | описание соответствует живой сцене | — |

</frozen-after-approval>

## Code Map

- `scripts/mock-ctx.js` — **новый**: `createMockCtx()` (надмножество простого мока и расширенного: `arcTo`, `quadraticCurveTo`, `closePath`, transform-методы, градиенты с записью `addColorStop`, `globalAlpha`), `callsNamed`, `frameCalls`, `sparkArcsIn`. Вне `test/`: `node --test` считает каждый `.js` в `test/` тестовым файлом и добавил бы фиктивный 44-й тест.
- `test/spark.test.js`, `matrix.test.js`, `contract.test.js`, `ritual.test.js`, `repeat.test.js`, `live.test.js` — **правка**: импорт из `../scripts/mock-ctx.js`, локальные копии удалить; тела тестов не трогать. `createHarness`, `createStorage`, `createSharedStorage`, `attachWorld`, `stopColors` остаются локально — они различаются по файлам.
- `src/world.js` — **правка**: импорт `SPARK_FALL_TO_RATIO` в шапку; убрать `const r`; helper `paintGloss(ctx, x, y, radius, peak)` (createRadialGradient → два addColorStop → fillStyle → fill) в `drawSnow` (0.32), `drawForest` (0.14), `drawTree` (0.3).
- `src/scene.js` — **правка**: в ветке ритуала x искры из `sparkAt(width, height)`.
- `README.md` — **правка**: «Ожидание» дополняется живой сценой (снег, огоньки, покачивание).
- Без изменений: `src/ritual.js`, `contract.js`, `spark.js`, `animation.js`, `main.js`, `index.html`, `docs/**`.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/mock-ctx.js` -- общий мок и выборки -- убрать пять копий
- [x] `test/*.test.js` -- импорт из `../scripts/mock-ctx.js`, удаление дублей -- тела не трогать
- [x] `src/world.js` -- импорт, `flake.r`, `paintGloss` -- меньше повторов
- [x] `src/scene.js` -- x через `sparkAt` -- один источник
- [x] `README.md` -- живая сцена в «Ожидании» -- документация не отстаёт
- [x] `npm test` и `npm run build` -- verify story

**Acceptance Criteria:**
- Given прежние тесты, when `npm test`, then 43/43, exit 0 — утверждения не изменены
- Given `npm run build`, then exit 0, статика собрана
- Given `git diff`, then только дубли, импорты, helper и README

## Implementation Notes

- Общий мок лежит в `scripts/mock-ctx.js`, а не в `test/support.js` из frozen-Intent: `node --test` считает любой `.js` внутри `test/` тестовым файлом — при первом прогоне появился фиктивный 44-й «тест». После переноса в `scripts/` счёт вернулся к 43. Все импорты в тестах обновлены; тела `test(...)` не тронуты.
- Матрица: поведенческие строки покрыты существующими 43 тестами (они все прошли); строка README проверяется вручную (`npm run dev` + чтение раздела) — новые тесты добавлены не были по frozen-запрету.

## Plan Change Log

- 2026-11-22 — реализация: 5 дублей мока заменены импортом из `scripts/mock-ctx.js`; `paintGloss`, перенос импорта, `sparkAt` для x искры, README; 43/43, build exit 0.

## Review Triage Log

**Quick-линза, 2026-11-22** (дифф `/tmp/opencode/story-refactor-sweep.diff`, baseline `c332d91`): 0 находок — невыполненных критериев, нарушенных правил и багов ревьюер не обнаружил. Перепроверено по смежному коду: мок в `scripts/mock-ctx.js` совпадает с прежним расширенным (baseline), тела 43 `test(...)` не тронуты, `paintGloss` сохраняет порядок и аргументы вызовов во всех трёх местах, `sparkPoint.x` равен прежнему `width * SPARK_POSITION.xRatio`, README соответствует `animation.js`/`main.js`. Deferred — ничего.

## Design Notes

**Почему общий мок безопасен.** Рекордеры пишут только при фактическом вызове, поэтому надмножество методов не добавляет `calls`. Расширенные копии идентичны, простые — их подмножество. Утверждения не меняются. Файл лежит в `scripts/`, а не в `test/`: `node --test` discovers любой `.js` внутри `test/` и посчитал бы хэлпер 44-м тестовым файлом.

**Почему harness не сливаются.** Стабы различаются (rAF-очередь, часы, `docEvents`, `hiddenProp`, `hasCanvas2D`, хранилища), а `attachWorld`/`stopColors` — локальные помощники одного файла; слияние потребовало бы менять тела тестов.

**Почему `paintGloss` не меняет кадр.** Та же последовательность вызовов; координаты, радиус и пик передаются аргументами.

**Границы.** Замечания ревью 1.3–1.5 уже закрыты в их планах; принятые с обоснованием пункты не переоткрываются, браузерный verify — шаг человека.

## Verification

**Commands:**
- `npm test` -- ✅ 2026-11-22: 43/43, exit 0 (счёт не вырос после переноса хэлпера в `scripts/`; тела тестов не менялись)
- `npm run build` -- ✅ 2026-11-22: exit 0, `dist/` собран

**Manual checks (if no CLI):**
- `npm run dev`: картинка и движение не изменились; ошибок в консоли нет (шаг человека — verify story 1.3–1.5)
