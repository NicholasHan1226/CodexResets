import {
  getForecastCalibrationFromStore,
  recordForecastSnapshotInStore,
  type ForecastCalibration,
  type ForecastStore,
  type LegacyForecastState,
} from './forecast';
import type { ResetRecordRow } from './types';

interface LedgerRequest {
  now?: unknown;
  observationHealthy?: unknown;
  rows?: unknown;
  legacy?: unknown;
}

const MAX_ROWS = 100;
const MAX_LEGACY_VALUE_BYTES = 100_000;
const LEGACY_MIGRATION_KEY = 'forecast:ledger-migrated-from-kv';

/**
 * Private, single-writer evidence ledger for forecast snapshots. The Worker
 * can receive cron and signed-webhook runs concurrently; durable storage keeps
 * their pending/evaluated sample transitions atomic and non-overlapping.
 */
export class ForecastLedger {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/calibration') {
      return response(await getForecastCalibrationFromStore(this.state.storage as ForecastStore));
    }
    if (request.method !== 'POST' || url.pathname !== '/record') return response({ error: 'not found' }, 404);

    let body: LedgerRequest;
    try {
      body = await request.json() as LedgerRequest;
    } catch {
      return response({ error: 'invalid json' }, 400);
    }
    const now = typeof body.now === 'number' && Number.isFinite(body.now) ? body.now : null;
    const rows = parseRows(body.rows);
    if (now === null || rows === null
      || (body.observationHealthy !== undefined && typeof body.observationHealthy !== 'boolean')) return response({ error: 'invalid forecast snapshot' }, 400);

    await migrateLegacyStateOnce(this.state.storage as ForecastStore, parseLegacyState(body.legacy));
    await recordForecastSnapshotInStore(this.state.storage as ForecastStore, rows, now, body.observationHealthy !== false);
    return response({ ok: true });
  }
}

async function migrateLegacyStateOnce(store: ForecastStore, legacy: LegacyForecastState | null): Promise<void> {
  if (await store.get(LEGACY_MIGRATION_KEY) !== null) return;
  if (legacy) {
    for (const [key, value] of Object.entries({
      'forecast:pending': legacy.pending,
      'forecast:evaluations': legacy.evaluations,
      'forecast:sample-day': legacy.sampleDay,
      'forecast:latest': legacy.latest,
    })) {
      if (value !== null) await store.put(key, value);
    }
  }
  await store.put(LEGACY_MIGRATION_KEY, '1');
}

function parseRows(value: unknown): ResetRecordRow[] | null {
  if (!Array.isArray(value) || value.length > MAX_ROWS) return null;
  const rows: ResetRecordRow[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') return null;
    const row = candidate as Partial<ResetRecordRow>;
    if (typeof row.id !== 'string' || row.id.length === 0 || row.id.length > 128
      || typeof row.reset_date !== 'string' || !Number.isFinite(Date.parse(row.reset_date))
      || typeof row.verified !== 'boolean') return null;
    rows.push({
      id: row.id,
      reset_date: row.reset_date,
      verified: row.verified,
      source_url: null,
      description: null,
      auto_state: row.auto_state,
      automated: row.automated,
      created_at: row.created_at,
    });
  }
  return rows;
}

function parseLegacyState(value: unknown): LegacyForecastState | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<LegacyForecastState>;
  const fields = ['pending', 'evaluations', 'sampleDay', 'latest'] as const;
  const legacy: Partial<LegacyForecastState> = {};
  for (const field of fields) {
    const entry = candidate[field];
    if (entry !== null && typeof entry !== 'string') return null;
    if (typeof entry === 'string' && entry.length > MAX_LEGACY_VALUE_BYTES) return null;
    legacy[field] = entry ?? null;
  }
  return legacy as LegacyForecastState;
}

function response(body: ForecastCalibration | { ok: true } | { error: string }, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
