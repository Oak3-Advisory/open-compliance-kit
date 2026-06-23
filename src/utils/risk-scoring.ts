import type { Risk } from '../types';

const WEIGHTS: Record<Risk['likelihood'], number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 5,
};

export type RiskScoreBand = 'low' | 'medium' | 'high' | 'critical';

/**
 * Calculate inherent risk score on a 1-25 scale.
 */
export function calculateInherentRiskScore(
  likelihood: Risk['likelihood'],
  impact: Risk['impact']
): number {
  return WEIGHTS[likelihood] * WEIGHTS[impact];
}

/**
 * Convert numeric risk score to a qualitative band.
 */
export function getRiskScoreBand(score: number): RiskScoreBand {
  if (score <= 4) return 'low';
  if (score <= 9) return 'medium';
  if (score <= 15) return 'high';
  return 'critical';
}