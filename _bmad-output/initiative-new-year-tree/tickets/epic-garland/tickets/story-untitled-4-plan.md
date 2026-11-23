---
title: 'Надёжность точки расширения сцены'
type: bugfix
ticket: '4'
created: '2026-11-23'
status: done
baseline_revision: 'ca82d5f748b55c828fb6ae5db6629ec944031784'
route: oneshot
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ретро `epic-scene` оставило открытыми риски в точке расширения сцены: исключение в кадре роняет rAF-цикл без восстановления, `globalAlpha` утекает между кадрами, в bootstrap нет guards для `win.addEventListener` и DOM-узлов, `startRitual` принимает нечисловой таймстемп, а проверка записи флага повторного входа инертна. Следующие эпики регистрируют свои объекты через этот контракт, поэтому один плохой кадр может остановить всю сцену.

**Approach:** Небольшие правки в существующих функциях bootstrap/кадра/ритуала и тесты, которые действительно падают без каждой правки. Поведение сцены, ритуал, контракт, слои и стиль остаются прежними; сервер, гирлянда и деплой не трогаются.

</frozen-after-approval>

## Code Map

- `src/main.js:61,93–118,203–207` — `looping`, `scheduleFrames()`, `frame()`, перезапуск из `visibilitychange`. Сейчас повторная queue идёт только на успешном кадре: при броске `looping` остаётся `true` и цикл мёртв. Нужно `try/finally`: в `finally` сбросить `looping` и один раз перепланировать кадр, если вкладка не скрыта; убрать старый вызов после `render`. Не менять одиночную queue и паузу скрытой вкладки — на это завязаны счётчики `rafQueue.length === 1` в `test/live.test.js`.
- `src/main.js:151–153,191` — `render()` пишет `caption.hidden`/`fallback.hidden` без проверки на null; `win.addEventListener('resize', …)` без guard. Образцы для копирования: `if (caption …)` в `onTouch` (`:123,126`), `finishRitual` (`:80`) и `typeof doc.addEventListener === 'function'` (`:203`). Не трогать текущее resize-поведение и запись флага.
- `src/scene.js:55–59,67–96` — фон закрашивается до `save()`, поэтому альфа объекта контракта утекает в следующий кадр. Поставить `ctx.globalAlpha = 1` перед заливкой фона, вне `save/restore`; не менять порядок background → spark → contract.draw → restore и число `fillRect`.
- `src/ritual.js:72–75` — `startRitual` пишет `t` в `startedAt` без проверки. Образцы: `Number.isFinite` в `src/animation.js:44,91,113` и `src/garland.js:52–57`. Guard делает нечисловой вызов no-op, не меняя тип `startedAt`. Граничные проверки `RITUAL_TOTAL` в тестах не трогать.
- `test/live.test.js:38–49,56–144,272–410,430–436,445,470–505` — `createSharedStorage`, `createHarness`, жёсткие счётчики кадра, инертная строка `noRafDark.storageWrites ?? []`, проверки fallbacks и паузы. Для finding 9 взять `const darkStorage = createSharedStorage(null)`, передать его в `createHarness({raf:false, storage:darkStorage})` и сверить `darkStorage.writes` с `[[FIRST_VISIT_KEY, FIRST_VISIT_VALUE]]`. Для finding 10 добавить в харнесс флаг `winEvents` и проверить, что bootstrap не бросает без `win.addEventListener`; для finding 11 — документ без `caption`/`fallback` и `hasCanvas2D:false`; для finding 7 — `contract.draw`, бросающий один раз, затем `flushFrame()` и проверка одной повторной queue.
- `test/ritual.test.js:70–137,185,273,527–530` — харнесс и прямые вызовы `startRitual`. Добавить no-op для `Number.NaN` и `touch(NaN) === false`, не меняя остальные assertions.
- `scripts/mock-ctx.js:13–59,61–71` — запись вызовов, включая `globalAlpha`; помощники `callsNamed`, `frameCalls`, `sparkArcsIn`. Использовать для проверки сброса альфы в первом вызове каждого кадра.

## Implementation Notes

Маршрут `oneshot`: правки механические, около 50 строк в пяти файлах, каждая закрывает одну найденную ретро-проблему и имеет свой тест.

Реализовано 2026-11-23:
- `src/main.js` — кадр обёрнут в `try/catch/finally`: ошибка объекта контракта не уходит наружу и не роняет цикл, следующий кадр планируется один раз, `looping` остаётся `true`; добавлены guards для `win.addEventListener`, `caption` и `fallback`.
- `src/scene.js` — `ctx.globalAlpha = 1` перед заливкой фона, вне `save/restore`.
- `src/ritual.js` — `startRitual` игнорирует нечисловой `t`.
- `test/live.test.js` — новые проверки rAF после ошибки, сброса альфы, guards; инертная проверка заменена на реальные `storage.writes`.
- `test/ritual.test.js` — no-op для `Number.NaN` в `startRitual` и `touch`.
- Локально: `npm test` 65/65, `npm run build` exit 0.
- По итогам quick-ревью `renderFrame` закрывает `save()` в `finally` даже при броске из объекта контракта; уточнены два комментария о порядке вызовов. Тесты и сборка после правок зелёные.

## Plan Change Log

## Review Triage Log

Итог quick-ревью: 2 находки — `medium` 1, `low` 1, `false` 0; обе исправлены, отложенного нет.

- `src/main.js:108–123`, `src/scene.js:68–100` — при броске из `contract.draw` кадр не вызывал `restore()`, а новый цикл продолжал рисовать на том же контексте; при движущейся камере (`t=4000`) это накапливало трансформацию и рвало фон. Verdict: **medium**, подтверждено — `moving` открывает `save()` до `contract.draw`, `restore()` стоял после него; тест с часами 0 не ловил случай. Route: patch — `renderFrame` теперь закрывает `save()` в `finally`, тест проверяет баланс `save/restore` при броске на движущейся камере.
- `src/scene.js:39–40`, `test/contract.test.js:75` — комментарии обещали «байт-в-байт» старый кадр и фон как первый вызов, хотя сброс альфы теперь первый вызов в кадре. Verdict: **low**, подтверждено — `ctx.globalAlpha = 1` записывается моком до `fillStyle`. Route: patch — формулировки уточнены без изменения поведения.

## Verification

**Commands:**
- `npm test` -- expected: exit 0, все тесты зелёные, включая новые проверки rAF, альфы, guards и `startRitual(NaN)`.
- `npm run build` -- expected: exit 0, в `dist/` только `index.html` и `src`.

**Manual checks (if no CLI):**
- Локально `npm run dev`: ритуал первого входа, тихий повторный вход и живая сцена выглядят как раньше; альфа и счётчик кадров не ломаются.

**Результат проверки человека (2026-11-23):** локально проверил, работает. Провёл человек, запись со слов человека.
