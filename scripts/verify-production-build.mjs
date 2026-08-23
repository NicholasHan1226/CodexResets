import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const distDir = resolve('dist');
const requiredValues = [
  'https://codexresets.cc',
  'BPWIlBQjXI3-tAr4fGCUCE9ML-nzHgBTbVERdrXtWnrm9edT0tyOHgVScCkwfBR2iFTDcEduN0Q1FHJzCvUk_FI',
];

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  }));
  return files.flat();
}

const files = await collectFiles(distDir);
const bundle = (await Promise.all(files.map((file) => readFile(file, 'utf8').catch(() => '')))).join('\n');
const missing = requiredValues.filter((value) => !bundle.includes(value));

if (missing.length > 0) {
  throw new Error(`Production bundle is missing required public configuration: ${missing.join(', ')}`);
}

console.log('Production bundle contains the required public configuration.');
