/**
 * Cliente de la API abierta de ESPN (site.api.espn.com). Sin key y sin
 * restricción de temporadas — reemplaza a API-Football (cuyo plan gratuito
 * bloquea 2025/2026) y a FBref/soccerdata (Cloudflare bloquea scraping).
 */

export const QUALIFYING_LEAGUES: Record<string, string> = {
  conmebol: "fifa.worldq.conmebol",
  concacaf: "fifa.worldq.concacaf",
  europe: "fifa.worldq.uefa",
  africa: "fifa.worldq.caf",
  asia: "fifa.worldq.afc",
  oceania: "fifa.worldq.ofc",
};

export const WORLD_CUP_LEAGUE = "fifa.world";
export const FRIENDLY_LEAGUE = "fifa.friendly";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

// Pausa corta entre requests para ser buenos ciudadanos con una API sin auth
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function espnGet<T>(url: string): Promise<T> {
  await delay(300);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN ${res.status}: ${url}`);
  return (await res.json()) as T;
}

export interface EspnCompetitor {
  homeAway: "home" | "away";
  winner?: boolean;
  score?: string;
  team: { id: string; displayName: string };
}

export interface EspnEvent {
  id: string;
  date: string;
  name: string;
  status: { type: { completed: boolean; state: string } };
  competitions: { id: string; competitors: EspnCompetitor[] }[];
}

/** Partidos de una liga en un rango de fechas (YYYYMMDD-YYYYMMDD). */
export async function scoreboard(league: string, dates: string): Promise<EspnEvent[]> {
  const data = await espnGet<{ events?: EspnEvent[] }>(`${BASE}/${league}/scoreboard?dates=${dates}&limit=1000`);
  return data.events ?? [];
}

export interface EspnSummary {
  boxscore?: {
    teams?: {
      team: { id: string; displayName: string };
      statistics?: { name: string; displayValue: string }[];
    }[];
  };
  rosters?: {
    team: { id: string; displayName: string };
    roster?: { starter?: boolean; jersey?: string; position?: { abbreviation?: string }; athlete?: { displayName: string } }[];
  }[];
}

/** Detalle de un partido: boxscore (stats) y rosters (alineaciones). */
export async function summary(league: string, eventId: string): Promise<EspnSummary> {
  return espnGet<EspnSummary>(`${BASE}/${league}/summary?event=${eventId}`);
}

/** Stat numérica del boxscore de un equipo, o null si no está. */
export function teamStat(s: EspnSummary, teamId: string, statName: string): number | null {
  const team = s.boxscore?.teams?.find((t) => t.team.id === teamId);
  const stat = team?.statistics?.find((x) => x.name === statName);
  if (!stat) return null;
  const v = Number(stat.displayValue);
  return Number.isFinite(v) ? v : null;
}

/**
 * Mapea nombres de The Odds API a los de ESPN. Normaliza y aplica alias
 * conocidos; null si no hay match confiable.
 */
export function matchTeamName(oddsApiName: string, candidates: string[]): string | null {
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, "and").replace(/[^a-z ]/g, "").trim();
  // Odds API → ESPN
  const aliases: Record<string, string> = {
    usa: "united states",
    "czech republic": "czechia",
    turkey: "turkiye",
    "ivory coast": "cote divoire",
  };
  const target = aliases[norm(oddsApiName)] ?? norm(oddsApiName);
  for (const c of candidates) {
    if (norm(c) === target) return c;
  }
  for (const c of candidates) {
    if (norm(c).includes(target) || target.includes(norm(c))) return c;
  }
  return null;
}
