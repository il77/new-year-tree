# Review narrative: deploy story 2.6

Target: commit 2f2edcb — feat: подготовка деплоя и приёмки в двух браузерах

Status: закрыт по поручению пользователя (Wrap-up) — «делай все что нужно хочу уже заканчивать». Все блоки отмечены закрытыми делегированием, а не поштучной приёмкой: ни один блок не был индивидуально проверен пользователем. Живая приёмка story 2.6 в двух браузерах остаётся шагом человека и этим walkthrough не закрыта.

## [x] Block 1 — Intent

**Problem:** Один процесс уже отдаёт статику и `/api/visit`, но деплой не подготовлен: сервер раздаёт корень репозитория, поэтому `docs/` и концепт-мок доступны по `/docs/`; нет инструкции и примеров конфигов. Живая приёмка остаётся за человеком.

**Approach:** Закрыть `/docs/` в сервере, добавить примеры systemd/nginx и раздел деплоя в README, зафиксировать решение в эпике. Публикацию и датированную проверку в двух браузерах делает человек; агент не выдумывает живой результат.

**Decision (2026-11-23, by human):** Закрыть `/docs/`: документация и мок остаются repo-only. Подготовить инструкцию и примеры systemd/nginx; на сервер агент не ставит и не публикует.

Source: `## Intent` section of [story-deploy-acceptance-plan.md](../tickets/epic-garland/tickets/story-deploy-acceptance-plan.md), pasted verbatim.

## [x] Block 2 — Broad strokes

- [scripts/serve.js:81](../../../scripts/serve.js#L81) — the one runtime change: `resolveFile` refuses anything inside `docs/`, so `/docs/` becomes a 404.
- [README.md:60](../../../README.md#L60) — operator-facing deploy section: copy the templates, substitute placeholders, then publish and check in two browsers.
- [deploy/ny-tree.service:9](../../../deploy/ny-tree.service#L9) — systemd template that starts the existing Node listener under a placeholder user, directory and port.
- [deploy/nginx.conf.example:23](../../../deploy/nginx.conf.example#L23) — nginx template that terminates TLS and proxies all traffic into that single Node process.
- [test/garland.test.js:374](../../../test/garland.test.js#L374) — HTTP test that pins the closed docs path next to the unchanged static and API paths.

## [x] Block 3 — Slice: `docs/` is closed in the server

`DOCS_DIR_NAME` is a new exported constant beside `DATA_DIR_NAME`, and `resolveFile` reuses the existing `isInside` helper to drop any path under `<root>/docs` immediately after the `data/` exclusion. Since dev serves the repository root, the same guard covers both `npm run dev` and a deployed service; the API and static branches are untouched.

- [scripts/serve.js:19](../../../scripts/serve.js#L19) — new `DOCS_DIR_NAME = 'docs'` constant.
- [scripts/serve.js:81](../../../scripts/serve.js#L81) — `isInside(filePath, path.join(root, DOCS_DIR_NAME))` returns `null`, the same outcome as the `data/` exclusion at [scripts/serve.js:76](../../../scripts/serve.js#L76).

## [x] Block 4 — Slice: HTTP coverage for the closed docs path

The harness now places a real mock file under the temporary server root, so the 404 is exercised against a file that exists rather than a missing one. The new test also checks that static HTML and the visit API keep responding in their original shape.

- [test/garland.test.js:74](../../../test/garland.test.js#L74) — harness creates `root/docs/design-final.html`.
- [test/garland.test.js:374](../../../test/garland.test.js#L374) — new test: `/docs/design-final.html` and `/docs` give 404 without leaking `repo-only mock`, `/index.html` gives 200, and `POST`/`GET /api/visit` keep the same JSON and counter.

## [x] Block 5 — Slice: deploy templates

Two new files under `deploy/` are examples only: a systemd unit starting `scripts/serve.js` with a placeholder user and directory, and an nginx config terminating TLS and proxying every application path to the Node listener. Both carry placeholders for user, directory, domain and TLS paths, plus notes on the `data/` directory and on keeping the proxy port in sync with `PORT`.

- [deploy/ny-tree.service:15](../../../deploy/ny-tree.service#L15) — `YOUR_USER`, `YOUR_GROUP`, `WorkingDirectory=/srv/YOUR_SITE_DIR`, `PORT=5173`, restart policy; the comment at [deploy/ny-tree.service:11](../../../deploy/ny-tree.service#L11) covers creating `data/`.
- [deploy/nginx.conf.example:23](../../../deploy/nginx.conf.example#L23) — TLS server block with domain and certificate placeholders; [deploy/nginx.conf.example:34](../../../deploy/nginx.conf.example#L34) proxies to `127.0.0.1:5173` with a note about changing the port alongside `PORT`; `dist/` is not served.

## [x] Block 6 — Slice: checking the config examples

A new dependency-free test reads both deploy files from disk and checks their shape, so the placeholders and the human-only marker cannot silently disappear.

- [test/deploy.test.js:14](../../../test/deploy.test.js#L14) — asserts all six placeholders, the `НЕ применяется агентом` marker in both files, and no private-key material.

## [x] Block 7 — Slice: operator instructions in README

The README now states the final repo-only status of `docs/`, adds step-by-step deployment, and separates the human's publishing and two-browser check from the agent's work. An empty dated-result table keeps live acceptance open.

- [README.md:56](../../../README.md#L56) — `docs/` is repo-only and closed by the server.
- [README.md:60](../../../README.md#L60) — deploy section and the five human steps.
- [README.md:90](../../../README.md#L90) — two-browser check and the empty dated-result table.

## [x] Block 8 — Periphery

- [epic-garland.md:68](../tickets/epic-garland/epic-garland.md#L68) — the epic's open question becomes the 2026-11-23 decision.
- [story-deploy-acceptance-plan.md](../tickets/epic-garland/tickets/story-deploy-acceptance-plan.md) — new plan file for story 6.
- [README.md:137](../../../README.md#L137) — both deploy examples added to the structure list.
- [README.md:29](../../../README.md#L29) — local `python3 -m http.server` note says it neither serves `/api/visit` nor closes `/docs/`.
