import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const publicDir = resolve(process.cwd(), 'public');

describe('Cloudflare Pages routing', () => {
  it('serves a real not-found document while preserving the React about route', () => {
    const notFoundPath = resolve(publicDir, '404.html');
    const aboutEntryPath = resolve(process.cwd(), 'about', 'index.html');

    expect(existsSync(notFoundPath)).toBe(true);
    expect(existsSync(aboutEntryPath)).toBe(true);
    expect(readFileSync(notFoundPath, 'utf8')).toContain('Page not found');
    expect(readFileSync(aboutEntryPath, 'utf8')).toContain('/src/main.tsx');
  });
});
