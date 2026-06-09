import { prisma } from "./db.js";

const BASE_URL = "https://v3.football.api-sports.io";
const DAILY_BUDGET = 90; // margen bajo el límite de 100/día del plan gratuito

// World Cup Qualification por confederación (league ids de API-Football)
export const QUALIFYING_LEAGUES: Record<string, number> = {
  africa: 29,
  asia: 30,
  concacaf: 31,
  europe: 32,
  oceania: 33,
  conmebol: 34,
};

export const WORLD_CUP_LEAGUE_ID = 1;

function requireKey(): string {
  const key = process.env.API_FOOTBALL_KEY ?? "";
  if (!key) throw new Error("API_FOOTBALL_KEY no está definida en .env — regístrate en api-football.com");
  return key;
}

/** Incrementa el contador diario y corta si se agota el presupuesto. */
async function consumeBudget(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const usage = await prisma.apiUsage.upsert({
    where: { date: today },
    create: { date: today, count: 1 },
    update: { count: { increment: 1 } },
  });
  if (usage.count > DAILY_BUDGET) {
    throw new Error(`Presupuesto diario de API-Football agotado (${DAILY_BUDGET} requests). Reintenta mañana.`);
  }
}

export async function apiFootballGet<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
  await consumeBudget();
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`${BASE_URL}${path}?${qs}`, {
    headers: { "x-apisports-key": requireKey() },
  });
  if (!res.ok) throw new Error(`API-Football ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { errors: unknown; response: T[] };
  if (body.errors && Object.keys(body.errors as object).length > 0) {
    throw new Error(`API-Football error: ${JSON.stringify(body.errors)}`);
  }
  return body.response;
}

export async function budgetUsedToday(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const usage = await prisma.apiUsage.findUnique({ where: { date: today } });
  return usage?.count ?? 0;
}

// ——— Tipos de respuesta (solo los campos que usamos) ———

export interface ApiFixture {
  fixture: { id: number; date: string; status: { short: string } };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
  goals: { home: number | null; away: number | null };
}

export interface ApiFixtureStats {
  team: { id: number; name: string };
  statistics: { type: string; value: number | string | null }[];
}

export interface ApiLineup {
  team: { id: number; name: string };
  formation: string | null;
  startXI: { player: { name: string; pos: string | null } }[];
  coach: { name: string | null };
}

/**
 * Mapea nombres de The Odds API a los de API-Football.
 * Normaliza y aplica alias conocidos; null si no hay match confiable.
 */
export function matchTeamName(oddsApiName: string, candidates: string[]): string | null {
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, "and").replace(/[^a-z ]/g, "").trim();
  const aliases: Record<string, string> = {
    "south korea": "south korea", // API-Football usa "South Korea"
    usa: "usa",
    "czech republic": "czech republic",
    turkey: "turkiye",
    "bosnia and herzegovina": "bosnia and herzegovina",
  };
  const target = aliases[norm(oddsApiName)] ?? norm(oddsApiName);
  for (const c of candidates) {
    if (norm(c) === target) return c;
  }
  // fallback: contención (ej. "Iran" vs "IR Iran")
  for (const c of candidates) {
    if (norm(c).includes(target) || target.includes(norm(c))) return c;
  }
  return null;
}
