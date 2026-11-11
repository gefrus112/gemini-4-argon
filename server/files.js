// Artifact store — files the models produce (HTML, SVG, three.js scenes, code)
// land here so the preview panel and file browser can show them.

import { mkdir, readFile, writeFile, readdir, unlink, stat } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ARTIFACTS_DIR = join(__dirname, '..', 'workspace', 'artifacts');

await mkdir(ARTIFACTS_DIR, { recursive: true });

const SAFE_NAME = /^[a-zA-Z0-9._-]{1,80}$/;

export async function saveArtifact(name, content) {
  const safe = basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!SAFE_NAME.test(safe)) throw new Error('invalid file name');
  await writeFile(join(ARTIFACTS_DIR, safe), content, 'utf8');
  return safe;
}

export async function readArtifact(name) {
  const safe = basename(name);
  return readFile(join(ARTIFACTS_DIR, safe), 'utf8');
}

export async function listArtifacts() {
  const names = await readdir(ARTIFACTS_DIR);
  const out = [];
  for (const n of names) {
    const s = await stat(join(ARTIFACTS_DIR, n));
    out.push({ name: n, bytes: s.size, modified: s.mtime.toISOString() });
  }
  return out.sort((a, b) => b.modified.localeCompare(a.modified));
}

export async function deleteArtifact(name) {
  await unlink(join(ARTIFACTS_DIR, basename(name)));
}
