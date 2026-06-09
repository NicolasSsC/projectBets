import { RISK } from "../config.js";

export interface KellyResult {
  edge: number; // p * odds - 1
  kellyFraction: number; // fracción plena de Kelly (antes del 25%)
  stake: number; // COP; 0 = no apostar
}

/**
 * Kelly fraccionario con banda flat 2–5% del plan:
 * - edge < minEdge → stake 0 (el filtro de value vive aquí, en un solo lugar)
 * - con value confirmado, el stake es quarter-Kelly acotado a [minStake, maxStake]:
 *   con bankroll de $300k quarter-Kelly puro casi nunca llega a $6.000, así que
 *   el piso actúa como el "flat 2%" del plan y Kelly escala dentro de la banda.
 */
export function kellyStake(pFair: number, odds: number, bankroll: number): KellyResult {
  const edge = pFair * odds - 1;
  if (odds <= 1 || edge < RISK.minEdge) {
    return { edge, kellyFraction: 0, stake: 0 };
  }
  const kellyFraction = edge / (odds - 1);
  const raw = bankroll * kellyFraction * RISK.kellyFraction;
  const clamped = Math.min(Math.max(raw, RISK.minStake), RISK.maxStake);
  // Redondeo a múltiplos de $100 COP
  return { edge, kellyFraction, stake: Math.round(clamped / 100) * 100 };
}
