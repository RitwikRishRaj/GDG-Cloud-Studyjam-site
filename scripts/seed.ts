import "dotenv/config";
import { seedIfEmpty } from "../src/lib/demo-data";

async function main() {
  const force = process.argv.includes("--force");
  const inserted = await seedIfEmpty(force);
  console.log(
    inserted
      ? "✔ Demo leaderboard data seeded."
      : "• Participants table already has data — skipped (use --force to reseed)."
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
