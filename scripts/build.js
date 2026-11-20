// Сборка статики без зависимостей: проверяет точки входа и копирует их в dist/.

import { cp, mkdir, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const ENTRIES = ['index.html', 'src'];

async function requireEntry(name) {
  try {
    await access(path.join(ROOT, name));
  } catch {
    console.error(`build: не найдена точка входа «${name}»`);
    process.exit(1);
  }
}

for (const entry of ENTRIES) {
  await requireEntry(entry);
}

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

for (const entry of ENTRIES) {
  await cp(path.join(ROOT, entry), path.join(DIST, entry), { recursive: true });
}

console.log(`build: статика собрана в ${path.relative(ROOT, DIST)}/ (${ENTRIES.join(', ')})`);
