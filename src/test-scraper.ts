import { runScraperCycle } from "./services/scraper.js";
import { db } from "./db/database.js";

async function main() {
  // 1. Run the scraper cycle
  await runScraperCycle();

  // 2. Query SQLite to confirm updated prices and timestamps
  console.log("?? UPDATED DATABASE READOUT:");
  
  const supplies = db.prepare("SELECT item_code, quantity_available, unit_price_usd, updated_at FROM supply_inventory").all();
  console.table(supplies);

  const fuels = db.prepare("SELECT corridor, price_per_gal, updated_at FROM fuel_prices").all();
  console.table(fuels);
}

main().catch(console.error);
