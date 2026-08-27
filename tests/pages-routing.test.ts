import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const publicDir = resolve(process.cwd(), 'public');

describe('Cloudflare Pages routing', () => {
  it('serves a real not-found document while preserving the React about route', () => {
    const notFoundPath = resolve(publicDir, '404.html');
    const redirectsPath = resolve(publicDir, '_redirects');

    expect(existsSync(notFoundPath)).toBe(true);
    expect(existsSync(redirectsPath)).toBe(true);
    expect(readFileSync(notFoundPath, 'utf8')).toContain('Page not found');
    expect(readFileSync(redirectsPath, 'utf8')).toMatch(/^\/about\/?\s+\/index\.html\s+200$/m);
  });
});
