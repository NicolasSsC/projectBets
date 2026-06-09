import { listSoccerSports } from "../../services/oddsApi.js";

const sports = await listSoccerSports();
console.log("Deportes de fútbol disponibles en The Odds API (0 créditos):\n");
for (const s of sports) {
  console.log(`${s.active ? "✅" : "⬜"} ${s.key.padEnd(40)} ${s.title}`);
}
console.log("\nSi el key del Mundial no es 'soccer_fifa_world_cup', actualiza ODDS_SPORT_KEY en .env");
