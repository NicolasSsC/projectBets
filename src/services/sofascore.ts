/**
 * Cliente best-effort de la API no oficial de Sofascore — SOLO para xG,
 * que ESPN no expone. Advertencias:
 * - Es la API interna de su web: puede cambiar o bloquear sin aviso.
 * - Todo consumidor debe tolerar fallos (try/catch) — nunca es bloqueante.
 * - Volumen mínimo y con pausa entre requests.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const BASE = "https://api.sofascore.com/api/v1";
const UA = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Cloudflare bloquea el fetch de Node (fingerprint TLS de undici) pero acepta
// curl, así que el request sale por curl del sistema.
async function sofaGet<T>(path: string): Promise<T> {
  await delay(500);
  const { stdout } = await execFileP("curl", [
    "-sS",
    "--fail-with-body",
    "--max-time", "20",
    "-H", `User-Agent: ${UA}`,
    "-H", "Accept: application/json",
    `${BASE}${path}`,
  ]);
  return JSON.parse(stdout) as T;
}

interface SearchResult {
  results?: { entity: { id: number; name: string; national?: boolean; gender?: string; sport?: { slug: string } } }[];
}

/** Busca el id de una selección masculina por nombre, o null. */
export async function findNationalTeamId(name: string): Promise<number | null> {
  const data = await sofaGet<SearchResult>(`/search/all?q=${encodeURIComponent(name)}`);
  const hit = (data.results ?? []).find(
    (r) => r.entity.national === true && r.entity.gender === "M" && r.entity.sport?.slug === "football",
  );
  return hit?.entity.id ?? null;
}

interface SofaEvent {
  id: number;
  startTimestamp: number;
  status: { type: string };
  homeTeam: { id: number };
  awayTeam: { id: number };
}

/** Últimos N partidos finalizados del equipo, más reciente primero. */
export async function lastFinishedEvents(teamId: number, n: number): Promise<SofaEvent[]> {
  const data = await sofaGet<{ events?: SofaEvent[] }>(`/team/${teamId}/events/last/0`);
  return (data.events ?? [])
    .filter((e) => e.status.type === "finished")
    .sort((a, b) => b.startTimestamp - a.startTimestamp)
    .slice(0, n);
}

interface SofaStats {
  statistics?: {
    period: string;
    groups: { statisticsItems: { name: string; home?: string; away?: string }[] }[];
  }[];
}

/** xG del equipo en un partido, o null si Sofascore no lo tiene. */
export async function eventXg(event: SofaEvent, teamId: number): Promise<number | null> {
  const data = await sofaGet<SofaStats>(`/event/${event.id}/statistics`).catch(() => null);
  if (!data) return null;
  const all = data.statistics?.find((p) => p.period === "ALL");
  for (const group of all?.groups ?? []) {
    const item = group.statisticsItems.find((s) => s.name === "Expected goals");
    if (item) {
      const raw = event.homeTeam.id === teamId ? item.home : item.away;
      const v = Number(raw);
      return Number.isFinite(v) ? v : null;
    }
  }
  return null;
}
