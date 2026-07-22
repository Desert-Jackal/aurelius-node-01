import { initDatabase, seedSampleData, db } from "./db/database.js";

async function main() {
  // 1. Create tables
  initDatabase();

  // 2. Populate test data
  seedSampleData();

  // 3. Query and print out the ground-truth data
  console.log("\n==========================================");
  console.log("?? GROUND-TRUTH SUPPLY MATRIX (DFW HUB)");
  console.log("==========================================");

  const materials = db.prepare("SELECT * FROM supply_inventory").all();
  console.log("\n??? Building Supplies:");
  console.table(materials);

  const fuels = db.prepare("SELECT * FROM fuel_prices").all();
  console.log("\n? Regional Fuel Rack Rates:");
  console.table(fuels);
}

main().catch(console.error);
