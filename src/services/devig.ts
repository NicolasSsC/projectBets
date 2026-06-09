/**
 * Quita el margen (vig) de un set de cuotas que cubren todos los resultados
 * de un mercado (2-way: over/under, 3-way: 1X2) usando el método multiplicativo.
 * Devuelve las probabilidades justas, en el mismo orden de entrada.
 */
export function devig(odds: number[]): number[] {
  if (odds.length < 2 || odds.some((o) => o <= 1)) {
    throw new Error(`Cuotas inválidas para de-vig: ${JSON.stringify(odds)}`);
  }
  const raw = odds.map((o) => 1 / o);
  const overround = raw.reduce((a, b) => a + b, 0);
  return raw.map((r) => r / overround);
}

/** Margen de la casa para un set de cuotas (ej: 0.04 = 4% de overround). */
export function overround(odds: number[]): number {
  return odds.reduce((a, o) => a + 1 / o, 0) - 1;
}
