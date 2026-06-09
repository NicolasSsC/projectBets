/** Etiqueta legible de un mercado/outcome para CLIs y reportes. */
export function formatMarket(market: string, outcome: string, line: number): string {
  if (market === "totals") return `${outcome} ${line}`;
  if (market === "totals_corners") return `córners ${outcome} ${line}`;
  return `1X2 ${outcome}`;
}
