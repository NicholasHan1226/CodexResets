/**
 * Weibull distribution model for reset interval prediction
 * 
 * The Weibull distribution is commonly used for modeling time-between-events
 * and provides better fit than simple exponential decay for reset patterns.
 */

import type { ResetRecord } from '../types/reset';

// Weibull distribution parameters
interface WeibullParams {
  shape: number;    // k (shape parameter)
  scale: number;    // λ (scale parameter)
}

/**
 * Calculate Weibull parameters from reset history using method of moments
 */
export function fitWeibull(records: ResetRecord[]): WeibullParams {
  if (records.length < 3) {
    // Fallback to exponential distribution (k=1)
    const avgInterval = calculateAverageInterval(records);
    return { shape: 1, scale: avgInterval };
  }

  // Calculate intervals in days
  const intervals = calculateIntervals(records);
  const n = intervals.length;

  if (n === 0) {
    return { shape: 1, scale: 3.8 }; // Default median
  }

  // Method of moments estimation
  const mean = intervals.reduce((a, b) => a + b, 0) / n;
  const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  // Approximate shape parameter using coefficient of variation
  const cv = stdDev / mean;
  
  // Approximation formula for Weibull shape from CV
  // k ≈ (σ/μ)^(-1.086) for CV between 0.5 and 2
  let shape = Math.pow(cv, -1.086);
  shape = Math.max(0.5, Math.min(5, shape)); // Clamp to reasonable range

  // Scale parameter from mean and shape
  // μ = λ * Γ(1 + 1/k)
  const gammaValue = gamma(1 + 1 / shape);
  const scale = mean / gammaValue;

  return { shape, scale };
}

/**
 * Weibull probability density function
 */
export function weibullPDF(x: number, params: WeibullParams): number {
  const { shape: k, scale: lambda } = params;
  if (x < 0) return 0;
  if (x === 0 && k < 1) return Infinity;
  
  return (k / lambda) * Math.pow(x / lambda, k - 1) * Math.exp(-Math.pow(x / lambda, k));
}

/**
 * Weibull cumulative distribution function
 * P(X ≤ x) = 1 - exp(-(x/λ)^k)
 */
export function weibullCDF(x: number, params: WeibullParams): number {
  if (x < 0) return 0;
  const { shape: k, scale: lambda } = params;
  return 1 - Math.exp(-Math.pow(x / lambda, k));
}

/**
 * Weibull survival function (reliability function)
 * P(X > x) = exp(-(x/λ)^k)
 */
export function weibullSurvival(x: number, params: WeibullParams): number {
  if (x < 0) return 1;
  const { shape: k, scale: lambda } = params;
  return Math.exp(-Math.pow(x / lambda, k));
}

/**
 * Weibull hazard function (instantaneous failure rate)
 * h(x) = (k/λ) * (x/λ)^(k-1)
 */
export function weibullHazard(x: number, params: WeibullParams): number {
  if (x < 0) return 0;
  const { shape: k, scale: lambda } = params;
  if (x === 0 && k < 1) return Infinity;
  if (x === 0 && k === 1) return 1 / lambda;
  if (x === 0) return 0;
  
  return (k / lambda) * Math.pow(x / lambda, k - 1);
}

/**
 * Calculate probability of reset within next N hours given days since last reset
 * Uses conditional probability: P(X ≤ t+Δt | X > t)
 */
export function calculateResetProbability(
  daysSinceLastReset: number,
  hoursAhead: number,
  params: WeibullParams
): number {
  const t = daysSinceLastReset;
  const dt = hoursAhead / 24;
  
  // P(reset in next dt days | survived t days)
  // = 1 - S(t+dt) / S(t)
  const survivalNow = weibullSurvival(t, params);
  const survivalLater = weibullSurvival(t + dt, params);
  
  if (survivalNow === 0) return 1;
  
  return 1 - (survivalLater / survivalNow);
}

/**
 * Calculate the most likely reset window (mode of conditional distribution)
 */
export function findMostLikelyWindow(
  daysSinceLastReset: number,
  params: WeibullParams
): { start: number; end: number; peak: number } {
  // Find the peak of the conditional hazard rate
  // For Weibull, if k > 1, the hazard increases with time
  // The most likely time is where the conditional PDF peaks
  
  const t = daysSinceLastReset;
  
  // Search for peak in next 14 days
  let peakDay = t + 1;
  let maxDensity = 0;
  
  for (let day = t; day < t + 14; day += 0.25) {
    const density = weibullHazard(day, params) * weibullSurvival(day, params);
    if (density > maxDensity) {
      maxDensity = density;
      peakDay = day;
    }
  }
  
  return {
    start: peakDay - 0.5, // 12 hours before peak
    end: peakDay + 0.5,   // 12 hours after peak
    peak: peakDay,
  };
}

/**
 * Generate probability curve for next 7 days
 */
export function generateProbabilityCurve(
  daysSinceLastReset: number,
  params: WeibullParams,
  points: number = 56 // 7 days * 8 points per day (every 3 hours)
): { hour: number; probability: number }[] {
  const curve: { hour: number; probability: number }[] = [];
  
  for (let i = 0; i < points; i++) {
    const hoursAhead = i * 3;
    const probability = calculateResetProbability(daysSinceLastReset, hoursAhead, params);
    curve.push({
      hour: hoursAhead,
      probability: Math.round(probability * 100) / 100,
    });
  }
  
  return curve;
}

// Helper functions

function calculateIntervals(records: ResetRecord[]): number[] {
  const sorted = [...records].sort((a, b) => b.timestamp - a.timestamp);
  const intervals: number[] = [];
  
  for (let i = 0; i < sorted.length - 1; i++) {
    const interval = (sorted[i].timestamp - sorted[i + 1].timestamp) / (1000 * 60 * 60 * 24);
    if (interval > 0 && interval < 100) { // Filter outliers
      intervals.push(interval);
    }
  }
  
  return intervals;
}

function calculateAverageInterval(records: ResetRecord[]): number {
  const intervals = calculateIntervals(records);
  if (intervals.length === 0) return 3.8; // Default median
  return intervals.reduce((a, b) => a + b, 0) / intervals.length;
}

/**
 * Gamma function approximation (Lanczos approximation)
 * Used for Weibull parameter estimation
 */
function gamma(z: number): number {
  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  }
  
  z -= 1;
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }
  
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}
