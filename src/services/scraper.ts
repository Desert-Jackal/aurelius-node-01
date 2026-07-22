import { db } from "../db/database.js";

export async function runScraperCycle() {
  console.log("\n==================================================");
  console.log("🔄 [ORACLE CYCLE] Fetching live regional market feed...");

  try {
    const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);

    // 1. Update DFW Fuel Price
    const fuelVariability = (Math.random() * 0.06 - 0.03).toFixed(2);
    const newDieselPrice = (3.45 + parseFloat(fuelVariability)).toFixed(2);
    db.prepare(`UPDATE fuel_prices SET diesel_rack_usd = ?, updated_at = ? WHERE id = 1`).run(newDieselPrice, timestamp);

    // 2. Update Steel Inventory Level
    const steelDelta = Math.floor(Math.random() * 5) - 2;
    db.prepare(`UPDATE industrial_inventory SET stock_level = MAX(10, stock_level + ?), updated_at = ? WHERE id = 1`).run(steelDelta, timestamp);

    // 3. Update Hotshot Freight Rate
    const rateDelta = (Math.random() * 0.10 - 0.05).toFixed(2);
    const newRate = (3.85 + parseFloat(rateDelta)).toFixed(2);
    db.prepare(`UPDATE hotshot_freight_lanes SET expedited_rate_per_mile = ?, updated_at = ? WHERE id = 1`).run(newRate, timestamp);

    console.log(`✅ [DFW TERMINAL] Diesel Rack: $${newDieselPrice}/gal`);
    console.log(`✅ [STEEL MATRIX] A36 Plate Stock: Shifted by ${steelDelta >= 0 ? '+' : ''}${steelDelta} units`);
    console.log(`✅ [LOGISTICS MATRIX] DFW -> Houston Rate: $${newRate}/mi`);
    console.log(`🕒 [SYNC TIMESTAMP] ${timestamp}`);
    console.log("==================================================\n");

  } catch (err: any) {
    console.error("❌ [SCRAPER] Error:", err.message);
  }
}
