---
title: 'Общий деплой и приёмка в двух браузерах'
type: feature
ticket: '6'
created: '2026-11-23'
status: done
baseline_revision: '1f534a21985ae5780920ed79'
route: full
route_source: auto
risk: high
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
context: ["README.md", "scripts/serve.js", "test/garland.test.js"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Один процесс уже отдаёт статику и `/api/visit`, но деплой не подготовлен: сервер раздаёт корень репозитория, поэтому `docs/` и концепт-мок доступны по `/docs/`; нет инструкции и примеров конфигов. Живая приёмка остаётся за человеком.

**Approach:** Закрыть `/docs/` в сервере, добавить примеры systemd/nginx и раздел деплоя в README, зафиксировать решение в эпике. Публикацию и датированную проверку в двух браузерах делает человек; агент не выдумывает живой результат.

**Decision (2026-11-23, by human):** Закрыть `/docs/`: документация и мок остаются repo-only. Подготовить инструкцию и примеры systemd/nginx; на сервер агент не ставит и не публикует.

## Boundaries & Constraints

**Always:** ноль зависимостей, Node 22+, `node:test`; один процесс раздаёт статику и `/api/visit`; `data/` не раздаётся; `dist/` содержит только `index.html` и `src/`; `https://zaytse3x.ddns.net` — целевой адрес по решению человека, а не утверждение, что сайт уже жив. Коммит — после одобрения плана, пуш — только по отдельному указанию.

**Never:** не менять сцену, ритуал, контракт, форму `/api/visit`, seed, цвета дня, порог 300 и слои 5/8/10/20; не включать `docs/` в `dist/`; не править `docs/design-final.html`; не писать за человека датированную проверку; не делать remote-операции без прямого указания.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Docs closed | `GET /docs/design-final.html`, файл есть в корне | 404, содержимое не отдаётся | Обычный 404, сервер не падает |
| Static alive | `GET /index.html` | 200, тот же HTML | Без ошибок |
| API alive | `POST`/`GET /api/visit` | Та же JSON-форма и счётчик | Как сейчас |
| Config examples | unit и nginx скопированы человеком | Понятные плейсхолдеры домена, путей и сертификатов | Агент ничего не применяет автоматически |

</frozen-after-approval>

## Code Map

- `scripts/serve.js:12,54–85,94–97,181–195` — корень статики и `resolveFile`; добавить закрытие `docs/` рядом с исключением `data/`, переиспользовать `isInside`; API не трогать.
- `test/garland.test.js:38–87,176–...` — HTTP-харнесс на порту 0; добавить файл в `root/docs/` и проверку 404, оставить проверки визитов.
- `README.md:15–30,47–55,70–72` — локальный запуск, сборка, структура; заменить «до story 2.6» на итоговое решение и добавить деплой.
- `deploy/ny-tree.service`, `deploy/nginx.conf.example` — новые примеры без установки; только плейсхолдеры.
- `_bmad-output/initiative-new-year-tree/tickets/epic-garland/epic-garland.md:68` — открытый вопрос про `docs/` перевести в решение.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/serve.js` -- закрыть `/docs/` в `resolveFile` через `isInside` -- мок остаётся repo-only и на живом сервере.
- [x] `test/garland.test.js` -- положить файл в `root/docs/`, проверить 404 и сохранить 200 для `/index.html` -- закрепить поведение без новых зависимостей.
- [x] `deploy/ny-tree.service` -- новый пример юнита с `PORT`, `WorkingDirectory` и перезапуском -- человек получает готовую основу.
- [x] `deploy/nginx.conf.example` -- новый пример прокси на 127.0.0.1 с плейсхолдерами TLS -- без секретов и без применения агентом.
- [x] `README.md` -- зафиксировать repo-only `docs/`, добавить шаги деплоя и вкладку датированной проверки человека -- единая инструкция.
- [x] `epic-garland.md` -- заменить Open question на Decision от 2026-11-23 -- закрыть вопрос эпика.

**Acceptance Criteria:**
- Given файл в `root/docs/`, when запрошен `/docs/design-final.html`, then сервер отвечает 404; `/index.html` и `/api/visit` работают как раньше.
- Given новые примеры конфигов, when их прочитал человек, then видны плейсхолдеры домена, путей и сертификатов и нет утверждения об уже выполненном деплое.
- Given обновлённый README, when прочитан, then repo-only статус `docs/` окончателен, шаги деплоя и шаг человека описаны раздельно.
- Given человек опубликовал сайт, when открыл целевой адрес в двух браузерах, then видит общий счётчик и огонёк и записывает датированный результат в этот план со своих слов.

## Implementation Notes

- `scripts/serve.js` — добавлен `DOCS_DIR_NAME = 'docs'`; в `resolveFile` сразу после исключения `data/` проверка `isInside(filePath, path.join(root, DOCS_DIR_NAME))`. API, seed, порог 300 и слои не тронуты.
- `test/garland.test.js` — харнесс создаёт `root/docs/design-final.html`; новый тест проверяет 404 на файл и папку, 200 на `/index.html` и неизменный POST/GET `/api/visit`.
- `deploy/ny-tree.service`, `deploy/nginx.conf.example` — примеры с плейсхолдерами пользователя, каталога, домена и TLS; nginx проксирует весь трафик в один Node-процесс, `dist/` не публикует. Агентом не применялись.
- `README.md` — «до story 2.6» заменено на окончательное repo-only решение; добавлены разделы «Деплой» и «Проверка человеком», в структуре перечислены примеры конфигов.
- `epic-garland.md` — Open question переведён в Decision от 2026-11-23.
- `test/deploy.test.js` — новый тест без зависимостей читает оба файла из `deploy/`, проверяет плейсхолдеры пользователя, домена, путей и TLS, пометку «НЕ применяется агентом» и отсутствие приватного ключа; закрывает строку I/O-матрицы «Config examples». nginx-пример проксирует весь трафик в Node, `dist/` не публикует; README согласован.

## Plan Change Log

## Review Triage Log

Итог quick-ревью: 3 находки — `medium` 2, `false` 1; `high` 0, `low` 0, `maybe-false` 0; обе `medium` исправлены, отложенного нет.

- `story-deploy-acceptance-plan.md:67,101`, `README.md:88–97` — датированного результата двух браузеров нет. Verdict: **false** — это не дефект изменения: замороженный Approach поручает публикацию и запись человеку, агент не должен выдумывать живой результат; план честно держит приёмку открытой. Rejected: ждём записи человека.
- `README.md:75–78`, `deploy/ny-tree.service:11–12`, `.gitignore:3`, `scripts/serve.js:134` — инструкция требует права записи только внутри `data/`, но в свежем клоне папки нет (`.gitignore:3`), а `recordVisit()` делает `mkdir(..., { recursive: true })`. Verdict: **medium**, подтверждено — без записи в корень WorkingDirectory сервис не создаст `data/` и не сохранит визиты. Route: patch — исправлено: README и комментарий юнита явно требуют создать `data/` от имени пользователя сервиса или дать запись в каталог сайта.
- `README.md:75–83`, `deploy/ny-tree.service:17–20`, `deploy/nginx.conf.example:32–34` — README разрешает менять `PORT`, но шаг nginx не напоминает заменить `127.0.0.1:5173`. Verdict: **medium**, подтверждено — при другом порте прокси останется на старом адресе и сайт станет недоступен. Route: patch — исправлено: README и комментарий nginx-примера прямо говорят заменить порт в `proxy_pass` при изменении `PORT`.
- 2026-11-25 — строка про отсутствие датированного результата закрыта: человек сказал «проверил», запись добавлена в Verification этого плана; детали проверки не сообщались.

## Design Notes

Сервер продолжает раздавать корень репозитория: так `npm run dev` работает без сборки, а API и `data/` остаются в одном процессе. `dist/` нужна только для статической отдачи и в деплое сервер не заменяет. systemd и nginx — примеры с плейсхолдерами: DDNS и TLS настраивает человек.

## Verification

**Commands:**
- `npm test` -- expected: exit 0, все тесты зелёные, включая новый 404 на `/docs/`.
- `npm run build` -- expected: exit 0, в `dist/` только `index.html` и `src/`.
- `PORT=5173 npm run dev` и `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/docs/design-final.html` -- expected: 404; `/` -- 200; `/api/visit` -- JSON.

**Результат проверки агентом (2026-11-23, локальные команды):**
- `npm test` — exit 0, 72/72 зелёный, включая `docs repo-only: /docs/design-final.html даёт 404, статика и API работают` и `deploy: плейсхолдеры пользователя, домена, путей и TLS; без приватного ключа`.
- `npm run build` — exit 0; `find dist -type f` — только `index.html` и `src/` (10 js-файлов), `docs/` и `data/` отсутствуют.
- `PORT=5199 node scripts/serve.js` + curl: `/` → 200, `/index.html` → 200, `/docs/design-final.html` → 404, `/docs` → 404, `/data/visits.json` → 404, `GET /api/visit` → 200 с JSON (`count`, `seed`, `tens`, `remainder`). Живой счётчик не менялся: использован GET, а не POST.

**Manual checks (if no CLI):**
- Человек по README разворачивает сервис, открывает <https://zaytse3x.ddns.net> в двух браузерах, видит один общий счётчик и огонёк и записывает датированный результат в раздел Verification этого плана. Агент добавляет запись только со слов человека.

**Результат проверки человека на живом адресе (2026-11-25):** человек сказал «проверил» для <https://zaytse3x.ddns.net> — живая проверка принята, story закрыта. Детали двухбраузерной проверки не фиксируются: их человек не сообщал.
