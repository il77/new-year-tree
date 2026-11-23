---
title: 'Уборка по итогам ревью'
type: refactor
ticket: '5'
created: '2026-11-23'
status: built
baseline_revision: '87fb2437b90ef1bee7d2c1afbde63247fb3432e5'
route: full
route_source: auto
risk: low
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
context: ["docs/contract.md", "docs/style.md", "README.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** После ретро `epic-scene` и сторис 2.1–2.4 остались пробелы в проверках и документации: overscan-тест смотрит один вертикальный случай, счётчик кадров считает любой `fillRect`, браузерная ветка `main.js`, порядок `save → draw → restore` и фолбэк на `Date.now()` не покрыты; гайд стиля противоречит моку, а формулировки плана 1.5, `docs/contract.md` и README устарели.

**Approach:** Только чистка: усилить существующие тесты, добавить небольшие стабы и поправить формулировки так, чтобы документы и проверки соответствовали текущему коду. Поведение сцены, ритуала, контракта, сервера и гирлянды не меняется.

**Decision (2026-11-23, by human):** Расширить исключение в гайде: фон, маски и полноширинные атмосферные полосы дымки/свечения в концепт-моке — исключение; остальные объекты остаются скруглёнными градиентами без `fillRect`. Код и мок не меняются.

## Boundaries & Constraints

**Always:** ноль зависимостей, Node 22+, `node:test`; все 현재 зелёные тесты остаются зелёными; `dist/` по-прежнему содержит только `index.html` и `src/`; `docs/` в этой истории остаётся repo-only; база — `baseline_revision` выше.

**Never:** не менять runtime-поведение, ритуал, контракт, слои 5/8/10/20, сервер, форму ответа, seed, цвета дня, порог 300 и деплой; не править мок `docs/design-final.html` ради тестов; не чинить найденный реальный дефект молча — сначала зафиксировать находку и спросить человека.

</frozen-after-approval>

## Code Map

- `scripts/mock-ctx.js:13–75` — мок фиксирует `{name,args}`; есть `callsNamed`, `frameCalls`, `sparkArcsIn`. Добавить помощник «фоновый кадр» по признаку `fillStyle === BACKGROUND` перед `fillRect` (импорт `BACKGROUND` из `src/scene.js`), не меняя существующие вызовы.
- `test/repeat.test.js:250–269` — три жёстких счётчика `fillRect === 2/3` считают все прямоугольники; заменить на новый помощник, сохранив проверки «один цикл», «касания не добавляют кадров», «resize — один кадр».
- `test/live.test.js:105,246–262,375–395` — харнесс всегда задаёт `win.performance`; overscan проверяет константы 400/800/640 и один вертикальный случай; есть тест баланса `save/restore`. Добавить: флаг отсутствия `performance`, проверку четырёх углов по фактическим `translate/rotate/scale`, порядок `save → искра/контракт → restore`.
- `src/main.js:36,54–59,227–263` — только для чтения: сигнатура `bootstrap(doc, win, contract = sceneContract)`, фолбэк `Date.now()`, браузерная ветка с `fetchVisit()` и `setInterval`. Изменений кода не планируется.
- `src/scene.js:9,56–105` — только для чтения: `BACKGROUND`, сброс альфы, фон до `save()`, `contract.draw` в `try`, `restore()` в `finally`.
- `docs/style.md:99`, `docs/design-final.html:153,205,253,262` — правило «никаких fillRect для объектов» конфликтует с дымкой и подсветкой в моке; нужна одна формулировка.
- `_bmad-output/initiative-new-year-tree/tickets/epic-scene/tickets/story-live-scene-plan.md:86`, `docs/contract.md:47`, `README.md:53–54,79–81` — инверсия про камеру, сигнатура без третьего аргумента, отсутствие пометки repo-only.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/mock-ctx.js` -- добавить помощник подсчёта фоновых кадров по `BACKGROUND` -- снять хрупкость счётчиков без правки рантайма.
- [x] `test/repeat.test.js` -- заменить три счётчика `fillRect` на новый помощник -- легальный прямоугольник будущего слоя не должен ломать тест повторного входа.
- [x] `test/live.test.js` -- добавить флаг `hasPerformance`, проверку четырёх углов на нескольких `t` и порядок `save → draw → restore` -- закрыть находки 15, 22, 23.
- [x] `test/main-browser.test.js` -- новый Node-тест page-ветки со стабами `document/window/fetch/setInterval` и динамическим импортом с уникальным query -- закрыть находку 21; изоляция обеспечивается process-per-file, поэтому сверяем дельту регистраций общего `sceneContract`, а не абсолютное число.
- [x] `docs/style.md` -- уточнить исключение для атмосферных полос мока -- одно правило для гайда и концепта.
- [x] `_bmad-output/initiative-new-year-tree/tickets/epic-scene/tickets/story-live-scene-plan.md` -- исправить «только при нейтральной камере» на «только при не-нейтральной» -- убрать инверсию.
- [x] `docs/contract.md` -- `bootstrap(doc, win, contract?)` в описании -- сигнатура должна совпадать с `src/main.js`.
- [x] `README.md` -- добавить, что `docs/` лежит только в репозитории и в `dist/` не попадает -- зафиксировать repo-only статус до story 2.6.

**Acceptance Criteria:**
- Given движущаяся камера, when по фактическим вызовам трансформации проверены четыре угла на нескольких `t`, then все углы остаются за пределами видимой области при `CONTENT_OVERSCAN`; старая проверка 400/800/640 сохранена.
- Given один кадр, when разобраны вызовы мока, then фоновый `fillRect` опознаётся по цвету, а `save` предшествует рисованию искры/контракта и закрывается `restore`.
- Given подставленные globals и уникальный импорт, when загружен `src/main.js` в page-режиме, then `page` не null, мир и гирлянда зарегистрированы, `render()` вызван; в обычном Node-тесте `page` остаётся null.
- Given `win.performance` отсутствует и `Date.now()` подставлен, when взят таймстемп кадра, then камера и ритуал используют подставленное время.
- Given документы после правки, when прочитаны style.md, план 1.5, contract.md и README, then правила не противоречат моку и коду, repo-only статус указан, runtime-поведение не изменилось.

## Implementation Notes

Реализовано 2026-11-23:
- `scripts/mock-ctx.js` — помощник `backgroundRectsIn` считает кадры по цвету фона перед `fillRect`.
- `test/repeat.test.js` — три счётчика заменены на фоновые кадры.
- `test/live.test.js` — проверены четыре угла по фактическим трансформациям на 7 значениях `t`, порядок `save → искра/контракт → restore`, фолбэк `Date.now()`.
- `test/main-browser.test.js` (новый) — page-ветка со стабами и динамическим импортом; POST, GET-опрос и счётчик покрыты.
- Документы приведены к коду: правило стиля, план 1.5, `docs/contract.md`, README (repo-only `docs/`).
- Локально: `npm test` 70/70, `npm run build` exit 0, в `dist/` только `index.html` и `src`.
- По итогам quick-ревью тест page-ветки сверяет дельту общего `sceneContract` и цвет ореола гирлянды; комментарий и Design Notes уточнены. Тесты и сборка после правок зелёные.

## Review Triage Log

Итог quick-ревью: 2 находки — `medium` 2, `false` 0; обе исправлены, отложенного нет.

- `test/main-browser.test.js:4,16–17,90–92`, `src/main.js:12,227`, `src/contract.js:98` — уникальный query висит только на `main.js`, а его относительный импорт `./contract.js` без query резолвится в общий `sceneContract`; page-ветка вызывает `bootstrap(document, window)` без третьего аргумента, поэтому 4 регистрации попадают в синглтон. Verdict: **medium**, подтверждено — комментарий о неиспользовании общего контракта ложен, `size === 4` зависит от порядка в процессе; при отключении process-per-file упадёт `test/contract.test.js:232`. Route: patch — импортировать `sceneContract`, сверить `mod.page.contract` с ним и дельту размера, исправить комментарий и уточнить Design Notes плана: изоляция обеспечивается process-per-file, а не query.
- `test/main-browser.test.js:90–97` — проверка `contract.size === 4` плюс цвет мира не доказывает, что четвёртый объект — гирлянда: `src/world.js:455–477` регистрирует ровно три слоя, любая четвёртая регистрация прошла бы тест. Verdict: **medium**, подтверждено — AC 3 требует мир и гирлянду, а тест не смотрит слой 20 или цвет гирлянды. Route: patch — добавить проверку `addColorStop` с цветом из `GARLAND_DAY_COLORS`, которого нет у слоёв мира.

## Design Notes

Маркер фона — признак в моке, а не новый вызов в рантайме. Page-ветка проверяется в отдельном процессе `node --test` со стабами globals и динамическим импортом с уникальным query для свежести модуля; общий `sceneContract` в этом процессе используется page-веткой, поэтому тест сверяет дельту регистраций, а не абсолютное число. `fetch` и таймер стабятся и снимаются в cleanup теста.

## Verification

**Commands:**
- `npm test` -- expected: exit 0, все тесты зелёные, включая новые проверки углов, порядка вызовов, page-ветки и `Date.now`.
- `npm run build` -- expected: exit 0, в `dist/` только `index.html` и `src`, папки данных нет.

**Manual checks (if no CLI):**
- Локально `npm run dev`: ритуал, живая сцена и гирлянда выглядят как до уборки, без чёрных полос по краям.
