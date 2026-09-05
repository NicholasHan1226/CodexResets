import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Use the installed Wrangler runtime/bundler; no extra test service or package.
const workerRequire = createRequire(new URL('../worker/package.json', import.meta.url));
const runtimeRequire = createRequire(workerRequire.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = runtimeRequire('miniflare');
const { build } = runtimeRequire('esbuild');
const root = resolve(new URL('..', import.meta.url).pathname);
const temp = await mkdtemp(join(tmpdir(), 'codexresets-runtime-'));
const bundle = await build({
  stdin: {
    contents: `import {PipelineCoordinator} from './worker/src/pipeline-coordinator';
      export {PipelineCoordinator};
      export default {fetch(request,env){return env.COORDINATOR.get(env.COORDINATOR.idFromName('global')).fetch(request)}};`,
    resolveDir: root, loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'neutral',
  plugins: [{ name: 'isolated-pipeline', setup(plugin) {
    plugin.onResolve({ filter: /^\.\/pipeline$/ }, (args) => args.importer.endsWith('pipeline-coordinator.ts') ? { path: 'fixture', namespace: 'fixture' } : undefined);
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: `
      export async function runPipelineOnce(env,trigger,ledger){
        if(trigger==='manual') throw new Error('fixture failure');
        const delay = await env.PROBE.fetch('https://probe/delay');
        if(!delay.ok) throw new Error('probe failed');
        const recipient='fixture@example.test';
        let sent=0;
        if(!await ledger.hasDelivered('fixture','email',recipient)){
          await env.PROBE.fetch('https://probe/send');
          await ledger.markDelivered('fixture','email',recipient);
          sent=1;
        }
        return {startedAt:new Date().toISOString(),trigger,scrape:'ok',tweetsSeen:0,candidates:0,inserted:0,notifiedEmails:sent,notifiedPush:0,errors:[]};
      }` }));
  } }],
});
let delays = 0;
let active = 0;
let maxActive = 0;
let sends = 0;
let started;
const firstStarted = new Promise((done) => { started = done; });
const options = {
  name: 'pipeline-runtime-fixture', modules: true, script: bundle.outputFiles[0].text,
  compatibilityDate: '2026-08-22', cf: false,
  durableObjects: { COORDINATOR: { className: 'PipelineCoordinator', useSQLite: true } },
  resourcePersistencePath: temp, kvNamespaces: ['CACHE'],
  serviceBindings: { PROBE: async (request) => {
    if (new URL(request.url).pathname === '/send') { sends++; return new Response('ok'); }
    active++; maxActive = Math.max(maxActive, active); delays++;
    if (delays === 1) { started(); await new Promise((done) => setTimeout(done, 31_000)); }
    active--;
    return new Response('ok');
  } },
  outboundService: async () => { throw new Error('External network forbidden in runtime test'); },
};
let runtime;
const request = (trigger) => runtime.dispatchFetch('https://coordinator/run', { method: 'POST', body: JSON.stringify({ trigger }) });
try {
  runtime = new Miniflare(convertV4MiniflareOptions(options));
  await runtime.ready;
  const began = Date.now();
  const first = request('cron');
  await firstStarted;
  const second = request('x-webhook');
  const reports = await Promise.all([first, second].map(async (result) => {
    const response = await result;
    assert.equal(response.status, 200);
    return response.json();
  }));
  assert.ok(Date.now() - began >= 30_000);
  assert.deepEqual(reports.map((report) => report.errors), [[], []]);
  assert.deepEqual(reports.map((report) => report.notifiedEmails), [1, 0]);
  assert.equal(maxActive, 1);
  assert.equal(sends, 1);
  const failed = await (await request('manual')).json();
  assert.equal(failed.scrape, 'failed');
  const cache = await runtime.getKVNamespace('CACHE');
  assert.equal(JSON.parse(await cache.get('health:last_run')).scrape, 'failed');
  const recovered = await (await request('cron')).json();
  assert.deepEqual(recovered.errors, []);
  await runtime.dispose();
  runtime = new Miniflare(convertV4MiniflareOptions(options));
  await runtime.ready;
  const restarted = await (await request('cron')).json();
  assert.equal(restarted.notifiedEmails, 0);
  assert.equal(sends, 1);
  console.log('Workers runtime passed: >30s I/O, serial triggers, interruption health, durable retry after restart.');
} finally {
  await runtime?.dispose();
  await rm(temp, { recursive: true, force: true });
}
