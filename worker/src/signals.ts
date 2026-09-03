import type { Env, PublicResetHistory, ScrapeResult, SignalSnapshot, SignalsPayload } from './types';
import { readJsonWithin } from './util';
import { RESET_RE, CONTEXT_RE, isResetTweet, isScheduledResetAnnouncement, parseScheduledResetAt } from './scrape';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
// Only an announcement without a parseable target is bounded by post age.
// Once an official target is explicit, the target itself is the meaningful
// expiry boundary; a late-day "tomorrow" target can otherwise outlive this
// post-age window by a few minutes and disappear before confirmation.
const UNTIMED_SCHEDULED_SIGNAL_TTL_HOURS = 48;
// A published target stays useful just long enough for the direct account
// timeline and the confirmation pipeline to converge. After that, an
// unconfirmed target is no longer a forward-looking answer and must not keep
// hiding the ordinary probability view merely because its original post is
// still inside the collection window.
const SCHEDULED_RESET_ELAPSED_GRACE_HOURS = 6;

interface StatusIncident {
  status: string;
  resolved_at: string | null;
  name: string;
}

export interface StatusEvidence {
  state: 'clear' | 'incident' | 'unavailable';
  incidentCount: number;
}

/**
 * Build the independent-signal snapshot server-side, mirroring the frontend
 * model. Timing context must not be duplicated as a derived launch source.
 * The browser reads this payload via /api/signals instead of attempting
 * fragile client-side scraping itself.
 */
export async function buildSignalsSnapshot(
  env: Env,
  scrape: ScrapeResult,
  latestResetTs: number,
  medianGapDays: number,
  history: PublicResetHistory[],
  statusEvidence?: StatusEvidence,
): Promise<SignalsPayload> {
  const now = Date.now();
  const daysSince = (now - latestResetTs) / DAY;
  const cooldownRatio = medianGapDays > 0 ? daysSince / medianGapDays : 0;

  const [tibo, statusPage] = await Promise.all([
    Promise.resolve(buildTiboSignal(scrape, now, latestResetTs)),
    buildStatusSignal(now, statusEvidence),
  ]);

  const cooldown: SignalSnapshot = {
    source: 'cooldown',
    label: 'Time Cooldown',
    status: cooldownRatio >= 1.2 ? 'active' : cooldownRatio >= 0.7 ? 'weak' : 'idle',
    value: Math.min(1, cooldownRatio),
    description: 'signals.cooldownDesc',
    descriptionParams: {
      d: daysSince.toFixed(1),
      m: medianGapDays.toFixed(1),
    },
    updatedAt: now,
  };

  return {
    signals: [tibo, statusPage, cooldown],
    generatedAt: now,
    history,
    sources: {
      // A reachable mirror is still useful discovery context, but it is not
      // an authoritative account feed and must not be labelled as live.
      tweets: scrape.sourceKind === 'direct' ? 'live' : scrape.ok ? 'stale' : 'down',
      statusPage: statusPage.description === 'signals.statusDown' ? 'down' : 'live',
      database: 'live',
    },
  };
}

function buildTiboSignal(scrape: ScrapeResult, now: number, latestResetTs: number): SignalSnapshot {
  const base = {
    source: 'tibopost',
    label: 'Tibo Posting',
    updatedAt: now,
    sourceUrl: 'https://x.com/thsottiaux',
  };

  // RSS/Nitter/news results may be stale, altered, or about a different
  // account. They remain useful to the Worker as discovery input but cannot
  // make a visitor-facing reset claim. Only authenticated X API results are
  // direct enough to lift this signal.
  if (scrape.ok && scrape.sourceKind === 'degraded') {
    return {
      ...base,
      status: 'idle',
      value: 0.1,
      description: 'signals.noHints',
    };
  }

  if (!scrape.ok || scrape.tweets.length === 0) {
    return {
      ...base,
      status: 'idle',
      value: 0.1,
      description: 'signals.tiboUnavailable',
    };
  }

  const latest = scrape.tweets[0];
  // `generatedAt` tells the browser when this snapshot was refreshed. The
  // radar's relative time must instead tell visitors when the source post was
  // written; otherwise an old official notice looks newly published on every
  // cron tick. Reject future/invalid source timestamps rather than turning
  // them into an active signal.
  const ageInHours = (tweet: typeof latest | undefined): number | null => {
    if (!tweet || !Number.isFinite(tweet.ts) || tweet.ts > now) return null;
    return Math.floor((now - tweet.ts) / HOUR);
  };
  const observedAt = (tweet: typeof latest | undefined): number =>
    ageInHours(tweet) === null ? now : tweet!.ts;
  // Confirmed reset notices retain the strict detector context. A separate
  // future-tense official schedule can lift the public planning signal, but
  // is never passed to the event detector or notification pipeline.
  const confirmedTweet = scrape.tweets.find(isResetTweet);
  const latestResetTweet = confirmedTweet || scrape.tweets.find((t) => RESET_RE.test(t.text) && CONTEXT_RE.test(t.text));
  const hoursSinceResetMention = ageInHours(latestResetTweet);
  // A completion post at or before the latest verified episode is already
  // history, not evidence for another future reset. Keep it available as an
  // idle confirmation when it is the newest post, but never let it raise the
  // forward-looking signal strength after the pipeline has confirmed it.
  const resetAlreadyConfirmed = Boolean(
    latestResetTweet
      && !isScheduledResetAnnouncement(latestResetTweet.text)
      && Number.isFinite(latestResetTs)
      && latestResetTs > 0
      // Follow-up wording can be less explicit than the completion post that
      // created the verified row. The model already merges related posts in
      // this 24-hour episode, so the radar must use the same boundary.
      && latestResetTweet.ts <= latestResetTs + DAY,
  );
  const scheduledResetTweet = scrape.tweets.find((t) => isScheduledResetAnnouncement(t.text)
    && (!confirmedTweet || t.ts > confirmedTweet.ts));
  const hoursSinceScheduledReset = ageInHours(scheduledResetTweet);
  const scheduledAt = scheduledResetTweet ? parseScheduledResetAt(scheduledResetTweet.text, scheduledResetTweet.ts) : undefined;
  const targetElapsed = typeof scheduledAt === 'number' && scheduledAt <= now;
  const elapsedWithinGrace = !targetElapsed
    || now - scheduledAt <= SCHEDULED_RESET_ELAPSED_GRACE_HOURS * HOUR;
  const scheduleIsFresh = typeof scheduledAt === 'number'
    ? elapsedWithinGrace
    : hoursSinceScheduledReset !== null && hoursSinceScheduledReset < UNTIMED_SCHEDULED_SIGNAL_TTL_HOURS;

  if (
    hoursSinceResetMention !== null &&
    hoursSinceResetMention < 24 &&
    !resetAlreadyConfirmed &&
    !(hoursSinceScheduledReset !== null && scheduleIsFresh) &&
    latestResetTweet &&
    isResetTweet(latestResetTweet)
  ) {
    return {
      ...base,
      status: 'active',
      value: 0.9,
      description: 'signals.resetAnnounced',
      descriptionParams: { n: hoursSinceResetMention },
      updatedAt: observedAt(latestResetTweet),
      sourceUrl: latestResetTweet.link,
    };
  }
  if (hoursSinceScheduledReset !== null
    && scheduleIsFresh) {
    return {
      ...base,
      status: 'active',
      value: 0.8,
      // Keep the official post visible while its confirmation is still
      // pending, but never describe a timestamp in the past as "upcoming".
      description: targetElapsed ? 'signals.resetScheduleElapsed' : 'signals.resetScheduled',
      updatedAt: observedAt(scheduledResetTweet),
      scheduledAt,
      sourceUrl: scheduledResetTweet?.link,
    };
  }
  if (resetAlreadyConfirmed && latestResetTweet === latest && hoursSinceResetMention !== null) {
    const confirmedWithinDay = hoursSinceResetMention < 24;
    return {
      ...base,
      status: 'idle',
      value: 0.08,
      description: confirmedWithinDay ? 'signals.resetConfirmed' : 'signals.resetConfirmedDays',
      descriptionParams: { n: confirmedWithinDay ? hoursSinceResetMention : Math.floor(hoursSinceResetMention / 24) },
      updatedAt: observedAt(latestResetTweet),
      sourceUrl: latestResetTweet.link,
    };
  }
  if (!resetAlreadyConfirmed && hoursSinceResetMention !== null && hoursSinceResetMention < 24 * 7) {
    return {
      ...base,
      status: 'weak',
      value: 0.4,
      description: 'signals.resetMentionedDays',
      descriptionParams: { n: Math.floor(hoursSinceResetMention / 24) },
      updatedAt: observedAt(latestResetTweet),
    };
  }

  const hoursSincePost = ageInHours(latest);
  if (hoursSincePost !== null && hoursSincePost < 24) {
    return { ...base, status: 'weak', value: 0.2, description: 'signals.activeToday', updatedAt: observedAt(latest) };
  }
  return {
    ...base,
    status: 'idle',
    value: 0.08,
    description: 'signals.lastPostDays',
    descriptionParams: { n: hoursSincePost === null ? 0 : Math.floor(hoursSincePost / 24) },
    updatedAt: observedAt(latest),
  };
}

async function buildStatusSignal(now: number, evidence?: StatusEvidence): Promise<SignalSnapshot> {
  const base = {
    source: 'status_page',
    label: 'OpenAI Status',
    updatedAt: now,
    sourceUrl: 'https://status.openai.com/history',
  };
  const current = evidence || await getStatusEvidence();
  if (current.state === 'incident') {
    return {
      ...base,
      status: 'active',
      value: 0.6,
      description: 'signals.statusActiveIncidents',
      descriptionParams: { n: current.incidentCount },
    };
  }
  if (current.state === 'clear') return { ...base, status: 'idle', value: 0.08, description: 'signals.statusClear' };
  return { ...base, status: 'idle', value: 0.05, description: 'signals.statusDown' };
}

/** Independent official status evidence. It can block a risky confirmation, never create one. */
export async function getStatusEvidence(): Promise<StatusEvidence> {
  try {
    const res = await fetch('https://status.openai.com/api/v2/incidents.json', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await readJsonWithin<{ incidents?: StatusIncident[] }>(res, 64 * 1024);
    if (!data) throw new Error('invalid or oversized status response');
    const KEYWORDS = ['codex', 'rate limit', 'usage limit', 'quota'];
    const active = (data.incidents || []).filter(
      (i) => i.status !== 'resolved' && !i.resolved_at && KEYWORDS.some((k) => i.name.toLowerCase().includes(k))
    );
    return active.length > 0
      ? { state: 'incident', incidentCount: active.length }
      : { state: 'clear', incidentCount: 0 };
  } catch {
    return { state: 'unavailable', incidentCount: 0 };
  }
}
