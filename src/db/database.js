import Database from "better-sqlite3";

export const db = new Database("ground_truth.db");

// Force clean table creation with updated schemas
db.exec(`
  DROP TABLE IF EXISTS industrial_inventory;
  DROP TABLE IF EXISTS fuel_prices;
  DROP TABLE IF EXISTS hotshot_freight_lanes;

  CREATE TABLE industrial_inventory (
    id INTEGER PRIMARY KEY,
    item_name TEXT,
    category TEXT,
    stock_level INTEGER,
    unit_price_usd TEXT,
    updated_at TEXT
  );

  CREATE TABLE fuel_prices (
    id INTEGER PRIMARY KEY,
    location TEXT,
    diesel_rack_usd TEXT,
    gas_unleaded_usd TEXT,
    updated_at TEXT
  );

  CREATE TABLE hotshot_freight_lanes (
    id INTEGER PRIMARY KEY,
    lane_name TEXT,
    expedited_rate_per_mile TEXT,
    updated_at TEXT
  );

  -- ⛽ Fuel Rack Rates (4 Regional Terminals)
  INSERT INTO fuel_prices (id, location, diesel_rack_usd, gas_unleaded_usd, updated_at) VALUES 
  (1, 'DFW Terminal (Irving)', '3.45', '2.92', datetime('now')),
  (2, 'Houston Ship Channel', '3.35', '2.79', datetime('now')),
  (3, 'Permian Hub (Midland)', '3.68', '3.12', datetime('now')),
  (4, 'San Antonio Terminal', '3.40', '2.85', datetime('now'));

  -- 📦 Industrial Inventory (6 Key Commodities)
  INSERT INTO industrial_inventory (id, item_name, category, stock_level, unit_price_usd, updated_at) VALUES
  (1, '3/4" Structural Steel Plate (A36)', 'Metals', 142, '850.00', datetime('now')),
  (2, 'Schedule 40 Carbon Steel Pipe 4"', 'Piping', 88, '42.50', datetime('now')),
  (3, 'Class 300 Flanged Gate Valves 2"', 'Valves', 34, '310.00', datetime('now')),
  (4, 'SYP #2 Structural Lumber 2x6x16', 'Lumber', 520, '14.25', datetime('now')),
  (5, 'Crushed Texas Limestone (Base Grade 2)', 'Aggregates', 1200, '22.00', datetime('now')),
  (6, 'Type I/II Portland Cement (94lb Bags)', 'Cement', 310, '16.50', datetime('now'));

  -- 🚚 Hotshot Freight Lanes (3 Regional Routes)
  INSERT INTO hotshot_freight_lanes (id, lane_name, expedited_rate_per_mile, updated_at) VALUES
  (1, 'Dallas/Fort Worth -> Houston Corridor', '3.85', datetime('now')),
  (2, 'Midland/Odessa -> Houston (Permian Basin)', '4.20', datetime('now')),
  (3, 'San Antonio -> Laredo (Border Freight)', '3.65', datetime('now'));
`);
