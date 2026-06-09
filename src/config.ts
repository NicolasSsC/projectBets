import "dotenv/config";

export const RISK = {
  initialBankroll: 300_000, // COP
  minEdge: 0.05, // edge mínimo sobre la probabilidad justa de Pinnacle
  kellyFraction: 0.25, // Kelly fraccionario
  minStake: 6_000, // COP — por debajo de esto NO se apuesta
  maxStake: 15_000, // COP
  dailyStopLoss: -30_000, // COP
} as const;

export const ODDS_API = {
  key: process.env.ODDS_API_KEY ?? "",
  sportKey: process.env.ODDS_SPORT_KEY ?? "soccer_fifa_world_cup",
  baseUrl: "https://api.the-odds-api.com/v4",
  cacheHours: 6, // no re-fetchear si hay cuotas Pinnacle más recientes que esto
} as const;

// Cuotas locales más viejas que esto no entran al detector: si Pinnacle mueve
// la línea después, una cuota local desactualizada mostraría value fantasma.
export const LOCAL_ODDS_MAX_AGE_HOURS = 24;

export const SHARP_SOURCE = "pinnacle";
export const LOCAL_SOURCES = ["betplay", "wplay"] as const;
