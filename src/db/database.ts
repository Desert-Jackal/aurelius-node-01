import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Initialize SQLite database file in the project root
const dbPath = path.join(process.cwd(), "ground_truth.db");

// Ensure parent directory exists before opening SQLite!
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);

// Enable Write-Ahead Logging (WAL) for high-concurrency read performance
db.pragma("journal_mode = WAL");

/**
 * Initializes the SQLite schema tables and indexes.
 */
export function initDatabase() {
  console.log("?? Initializing Ground-Truth SQLite Database Schema...");

  // 1. Fuel & Diesel Corridor Pricing
  db.exec(`
    CREATE TABLE IF NOT EXISTS fuel_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      corridor TEXT NOT NULL,
      fuel_type TEXT NOT NULL,
      price_per_gal REAL NOT NULL,
      terminal_location TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Industrial & Building Materials Inventory
  db.exec(`
    CREATE TABLE IF NOT EXISTS supply_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_code TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      quantity_available INTEGER NOT NULL,
      unit_price_usd REAL NOT NULL,
      yard_location TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 3. Freight & Transport Availability
  db.exec(`
    CREATE TABLE IF NOT EXISTS freight_availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      carrier_id TEXT NOT NULL,
      equipment_type TEXT NOT NULL,
      capacity_tons REAL NOT NULL,
      origin_hub TEXT NOT NULL,
      destination_zone TEXT NOT NULL,
      status TEXT CHECK(status IN ('available', 'in_transit', 'booked')) DEFAULT 'available',
      rate_per_mile REAL NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log("? Database Schema Created & Ready!");
}

/**
 * Helper function to seed initial test data into ground_truth.db
 */
export function seedSampleData() {
  console.log("?? Seeding DFW Regional Supply Data...");

  // Seed Fuel Prices
  const insertFuel = db.prepare(`
    INSERT INTO fuel_prices (corridor, fuel_type, price_per_gal, terminal_location)
    VALUES (?, ?, ?, ?)
  `);

  const fuelCount = db.prepare("SELECT COUNT(*) as count FROM fuel_prices").get() as { count: number };
  if (fuelCount.count === 0) {
    insertFuel.run("I-35-DFW", "ultra_low_sulfur_diesel", 3.24, "Dallas South Terminal");
    insertFuel.run("I-45-DFW", "ultra_low_sulfur_diesel", 3.19, "Ennis Terminal");
    insertFuel.run("I-20-WEST", "regular_unleaded", 2.85, "Fort Worth Terminal");
  }

  // Seed Materials Inventory
  const insertSupply = db.prepare(`
    INSERT OR REPLACE INTO supply_inventory (item_code, category, description, quantity_available, unit_price_usd, yard_location)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertSupply.run("STL-PIPE-4IN", "Steel Pipe", '4" Schedule 40 Carbon Steel Pipe (20ft)', 450, 85.50, "DFW Industrial Yard East");
  insertSupply.run("LMB-2X4-16FT", "Lumber", "2x4x16 #2 Prime Southern Yellow Pine", 1200, 7.80, "Fort Worth Lumber Hub");
  insertSupply.run("GRV-CRUSH-TON", "Aggregates", "Crushed Limestone Base (Per Ton)", 850, 22.00, "Denton Quarry Depot");

  console.log("? Seed Data Inserted Successfully!");
}
