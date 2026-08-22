import {
  getForecastCalibrationFromStore,
  recordForecastSnapshotInStore,
  type ForecastCalibration,
  type ForecastStore,
} from './forecast';
import type { ResetRecordRow } from './types';

interface LedgerRequest {
  now?: unknown;
  rows?: unknown;
}

const MAX_ROWS = 100;

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
    if (now === null || rows === null) return response({ error: 'invalid forecast snapshot' }, 400);

    await recordForecastSnapshotInStore(this.state.storage as ForecastStore, rows, now);
    return response({ ok: true });
  }
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
    });
  }
  return rows;
}

function response(body: ForecastCalibration | { ok: true } | { error: string }, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
