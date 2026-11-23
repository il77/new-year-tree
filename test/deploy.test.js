// Story 6 — проверка примеров деплоя без запуска systemd/nginx: плейсхолдеры
// вместо домена, путей и сертификатов, никаких секретов и автоматического
// применения агентом (строка I/O-матрицы «Config examples»).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEPLOY_DIR = path.join(ROOT, 'deploy');

test('deploy: плейсхолдеры пользователя, домена, путей и TLS; без приватного ключа', async () => {
  const [unit, nginx] = await Promise.all([
    readFile(path.join(DEPLOY_DIR, 'ny-tree.service'), 'utf8'),
    readFile(path.join(DEPLOY_DIR, 'nginx.conf.example'), 'utf8'),
  ]);

  for (const [config, token] of [
    [unit, 'YOUR_USER'],
    [unit, 'YOUR_GROUP'],
    [unit, 'YOUR_SITE_DIR'],
    [nginx, 'YOUR_DOMAIN'],
    [nginx, 'YOUR_HTTP_ROOT'],
    [nginx, 'YOUR_TLS_DIR'],
  ]) {
    assert.match(config, new RegExp(token), `${token} — понятный плейсхолдер`);
  }

  for (const [name, config] of [['ny-tree.service', unit], ['nginx.conf.example', nginx]]) {
    assert.match(config, /НЕ применяется агентом/, `${name}: пример только для человека`);
    assert.doesNotMatch(config, /PRIVATE KEY/i, `${name}: нет приватного ключа`);
    assert.doesNotMatch(config, /-----BEGIN/, `${name}: нет блока ключа или сертификата`);
  }
});
