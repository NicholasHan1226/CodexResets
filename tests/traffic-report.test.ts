import { describe, expect, it } from 'vitest';
import { readTrafficReport, summarizeTraffic, trafficQuery } from '../scripts/traffic-report.mjs';

const response = (rows: unknown[]) => ({ data: { viewer: { accounts: [{ rumPageloadEventsAdaptiveGroups: rows }] } }, errors: null });
const row = (bot: number, count: number, visits: number, sampleInterval = 1) => ({ dimensions: { bot, siteTag: 'fixture' }, count, sum: { visits }, avg: { sampleInterval } });

describe('read-only traffic reporting', () => {
  it('separates bot traffic and does not multiply already estimated sampled counts', () => {
    expect(summarizeTraffic(response([row(0, 90, 30, 10), row(1, 10, 7)]))).toMatchObject({
      pageViews: 100, nonBotPageViews: 90, nonBotVisits: 30, botPageViews: 10, sampled: true, maxSampleInterval: 10,
    });
  });
  it('distinguishes empty data from denied, incomplete and malformed data', () => {
    expect(summarizeTraffic(response([])).pageViews).toBe(0);
    for (const data of [{ errors: [{ message: 'denied' }] }, {}, response(Array(1000).fill(row(0, 1, 1))), response([row(2, 1, 1)]), response([row(0, -1, 1)])]) {
      expect(() => summarizeTraffic(data)).toThrow();
    }
  });
  it('limits every query to the production hostname with explicit half-open windows', () => {
    const q = trafficQuery('a'.repeat(32), '2026-09-04T06:00:00Z', '2026-09-05T06:00:00Z');
    expect(q).toContain('requestHost:"codexresets.cc"');
    expect(q).toContain('datetime_lt:"2026-09-05T06:00:00.000Z"');
    expect(q).not.toContain('httpRequests');
    expect(() => trafficQuery('bad', 0, 1)).toThrow();
  });
  it('builds all windows and fails rather than emitting a misleading partial report', async () => {
    const requests: string[] = [];
    const fetchImpl = async (_url: string, init: RequestInit) => {
      requests.push(String(init.body));
      return new Response(JSON.stringify(response([row(0, 2, 1)])), { status: 200 });
    };
    const options = { token: 'fixture', accountId: 'a'.repeat(32), end: '2026-09-05T06:00:00Z', fetchImpl };
    const report = await readTrafficReport(options);
    expect(requests).toHaveLength(6);
    expect(report.windows.last7Days.start).toBe('2026-08-29T06:00:00.000Z');
    expect(report.windows.previous7Days.end).toBe(report.windows.last7Days.start);
    expect(JSON.stringify(report)).not.toContain('Bearer');
    await expect(readTrafficReport({ ...options, fetchImpl: async () => new Response('', { status: 403 }) })).rejects.toThrow('403');
  });
});
