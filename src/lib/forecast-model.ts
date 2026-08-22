import { calculateResetProbability, fitWeibull } from '@/lib/weibull';
import { intervalDays, median, mergeResetEpisodes } from '@/lib/reset-episodes';
import type { ResetRecord, ResetSignal } from '@/types/reset';

export type ForecastModelName = 'logistic' | 'weibull';

export interface BacktestScore {
  model: ForecastModelName;
  brier: number;
  samples: number;
}

export interface ForecastSelection {
  model: ForecastModelName;
  scores: BacktestScore[];
  episodes: ResetRecord[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_HISTORY = 4;
const MIN_BACKTEST_SAMPLES = 16;

function logisticCdf(days: number, medianDays: number): number {
  const steepness = 1.5 / Math.max(medianDays, 0.25);
  return 1 / (1 + Math.exp(-steepness * (days - medianDays)));
}

function logisticProbability(records: ResetRecord[], elapsedDays: number, horizonHours: number): number {
  const historyMedian = median(intervalDays(records));
  const current = logisticCdf(elapsedDays, historyMedian);
  const later = logisticCdf(elapsedDays + horizonHours / 24, historyMedian);
  return clampProbability((later - current) / Math.max(1 - current, 0.000_001));
}

function weibullProbability(records: ResetRecord[], elapsedDays: number, horizonHours: number): number {
  if (records.length < MIN_HISTORY) return logisticProbability(records, elapsedDays, horizonHours);
  return clampProbability(calculateResetProbability(elapsedDays, horizonHours, fitWeibull(mergeResetEpisodes(records))));
}

function probabilityFor(model: ForecastModelName, records: ResetRecord[], elapsedDays: number, horizonHours: number): number {
  return model === 'weibull'
    ? weibullProbability(records, elapsedDays, horizonHours)
    : logisticProbability(records, elapsedDays, horizonHours);
}

function clampProbability(value: number): number {
  return Math.max(0, Math.min(0.995, Number.isFinite(value) ? value : 0));
}

/**
 * Time-ordered backtest. Each historical cutoff is fitted only with events
 * known at that moment, then scored against whether a reset followed in 24h
 * or 48h. This avoids choosing a model from a flattering in-sample fit.
 */
export function scoreForecastModels(records: ResetRecord[]): BacktestScore[] {
  const episodes = mergeResetEpisodes(records).sort((a, b) => a.timestamp - b.timestamp);
  if (episodes.length < MIN_HISTORY + 2) {
    return [
      { model: 'logistic', brier: Number.POSITIVE_INFINITY, samples: 0 },
      { model: 'weibull', brier: Number.POSITIVE_INFINITY, samples: 0 },
    ];
  }

  const totals: Record<ForecastModelName, { error: number; samples: number }> = {
    logistic: { error: 0, samples: 0 },
    weibull: { error: 0, samples: 0 },
  };
  const firstCutoff = episodes[MIN_HISTORY - 1].timestamp + DAY_MS;
  const finalCutoff = episodes[episodes.length - 1].timestamp - 48 * 60 * 60 * 1000;

  for (let cutoff = firstCutoff; cutoff <= finalCutoff; cutoff += DAY_MS) {
    const past = episodes.filter((episode) => episode.timestamp <= cutoff);
    if (past.length < MIN_HISTORY) continue;
    const newest = past[past.length - 1];
    const elapsedDays = (cutoff - newest.timestamp) / DAY_MS;
    for (const horizonHours of [24, 48]) {
      const horizonEnd = cutoff + horizonHours * 60 * 60 * 1000;
      const actual = episodes.some((episode) => episode.timestamp > cutoff && episode.timestamp <= horizonEnd) ? 1 : 0;
      for (const model of ['logistic', 'weibull'] as const) {
        const probability = probabilityFor(model, past, elapsedDays, horizonHours);
        totals[model].error += (probability - actual) ** 2;
        totals[model].samples += 1;
      }
    }
  }

  return (['logistic', 'weibull'] as const).map((model) => ({
    model,
    brier: totals[model].samples > 0 ? totals[model].error / totals[model].samples : Number.POSITIVE_INFINITY,
    samples: totals[model].samples,
  }));
}

export function selectForecastModel(records: ResetRecord[]): ForecastSelection {
  const episodes = mergeResetEpisodes(records);
  const scores = scoreForecastModels(episodes);
  const eligible = scores.filter((score) => score.samples >= MIN_BACKTEST_SAMPLES && Number.isFinite(score.brier));
  const best = eligible.sort((a, b) => a.brier - b.brier)[0];
  return { model: best?.model || 'logistic', scores, episodes };
}

export function probabilityWithin(
  records: ResetRecord[],
  model: ForecastModelName,
  now: number,
  horizonHours: number,
  hasStrongDirectSignal: boolean,
): number {
  const episodes = mergeResetEpisodes(records);
  const latest = episodes[0];
  if (!latest) return hasStrongDirectSignal ? 0.35 : 0.08;
  const elapsedDays = Math.max(0, (now - latest.timestamp) / DAY_MS);
  const base = probabilityFor(model, episodes, elapsedDays, horizonHours);
  // A fresh signed/direct announcement is predictive, but never a standalone
  // confirmation. The Worker retains its stabilization and correction gates.
  return hasStrongDirectSignal ? 1 - (1 - base) * 0.65 : base;
}

export function hasFreshStrongDirectSignal(signals: ResetSignal[] | undefined, now: number): boolean {
  const signal = signals?.find((item) => item.source === 'tibopost');
  return Boolean(
    signal
      && signal.status === 'active'
      && signal.value >= 0.8
      && signal.description === 'signals.resetAnnounced'
      && now - signal.updatedAt >= 0
      && now - signal.updatedAt <= DAY_MS,
  );
}
