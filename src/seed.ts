import { db } from "./db/database.js";

console.log("? Expanding Aurelius Node 01 Data Matrix...");

// 1. Create Industrial Inventory Table
db.exec(`
  CREATE TABLE IF NOT EXISTS industrial_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_code TEXT UNIQUE,
    category TEXT,
    description TEXT,
    quantity_available INTEGER,
    unit_price_usd REAL,
    yard_location TEXT,
    region TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 2. Freight & Hotshot Logistics Table
db.exec(`
  CREATE TABLE IF NOT EXISTS hotshot_freight_lanes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origin_hub TEXT,
    destination_hub TEXT,
    corridor TEXT,
    avg_rate_per_mile REAL,
    expedited_rate_per_mile REAL,
    equipment_type TEXT,
    lead_time_hours INTEGER,
    status TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 3. Wholesale Regional Supply Yards
db.exec(`
  CREATE TABLE IF NOT EXISTS regional_yards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    yard_code TEXT UNIQUE,
    yard_name TEXT,
    city TEXT,
    corridor TEXT,
    crane_capacity_tons INTEGER,
    gate_status TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Clear old data for fresh seed
db.prepare("DELETE FROM industrial_inventory").run();
db.prepare("DELETE FROM hotshot_freight_lanes").run();
db.prepare("DELETE FROM regional_yards").run();

// Seed Industrial Supplies (Dozens of items across Texas)
const insertItem = db.prepare(`
  INSERT INTO industrial_inventory (item_code, category, description, quantity_available, unit_price_usd, yard_location, region)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const inventoryData = [
  // Steel & Metal
  ["STL-PIPE-4IN", "Steel Pipe", "4\" Schedule 40 Carbon Steel Pipe (20ft)", 420, 86.00, "DFW Industrial Yard East", "North Texas"],
  ["STL-PIPE-6IN", "Steel Pipe", "6\" Schedule 80 Seamless Carbon Steel Pipe (20ft)", 180, 142.50, "DFW Industrial Yard East", "North Texas"],
  ["STL-REBAR-N5", "Rebar", "#5 Grade 60 Deformed Steel Rebar (20ft bundle x100)", 85, 920.00, "Fort Worth Steel Hub", "North Texas"],
  ["STL-BEAM-W12", "Structural Steel", "W12x26 Structural Wide Flange I-Beam (40ft)", 64, 480.00, "Houston Port Depot", "Gulf Coast"],
  
  // Lumber & Building Materials
  ["LMB-2X4-16FT", "Lumber", "2x4x16 #2 Prime Southern Yellow Pine", 1150, 7.75, "Fort Worth Lumber Hub", "North Texas"],
  ["LMB-2X6-20FT", "Lumber", "2x6x20 #1 Structural Yellow Pine", 640, 14.20, "Fort Worth Lumber Hub", "North Texas"],
  ["PLY-CDX-34IN", "Plywood", "3/4\" 4x8 CDX Pine Plywood Sheathing", 820, 29.50, "Ennis Regional Distribution Center", "I-45 Corridor"],
  ["PLY-MARINE-12", "Plywood", "1/2\" 4x8 Marine Grade Exterior Plywood", 310, 68.00, "Houston Port Depot", "Gulf Coast"],

  // Aggregates & Earthwork
  ["GRV-CRUSH-TON", "Aggregates", "Crushed Limestone Base (Per Ton)", 900, 22.50, "Denton Quarry Depot", "I-35 Corridor"],
  ["SND-WASHED-TON", "Aggregates", "Concrete Grade Washed Concrete Sand (Per Ton)", 1400, 18.00, "Waco Aggregates Hub", "I-35 Corridor"],
  ["RIP-RAP-3x6", "Aggregates", "3\"-6\" Heavy Rip-Rap Stone (Per Ton)", 650, 31.00, "Denton Quarry Depot", "I-35 Corridor"],

  // Electrical & Conduit
  ["ELE-PVC-2IN", "Conduit", "2\" Schedule 40 Rigid PVC Electrical Conduit (10ft)", 1200, 11.40, "San Antonio Distro Park", "I-35 South"],
  ["ELE-COP-500THHN", "Wire & Cable", "500 MCM THHN Copper Wire (1000ft Spool)", 14, 4850.00, "DFW Industrial Yard East", "North Texas"],
  ["ELE-TRANS-75KVA", "Transformers", "75 KVA 3-Phase Dry Type Transformer 480V-208Y/120V", 8, 3450.00, "Austin Tech Ridge Logistics", "I-35 South"],

  // Industrial Plumbing & Valves
  ["VLV-GATE-6IN", "Valves", "6\" Class 150 Cast Steel Flanged Gate Valve", 32, 640.00, "Houston Port Depot", "Gulf Coast"],
  ["FLG-ANSI-6IN", "Flanges", "6\" 150# Weld Neck Flange Raised Face", 140, 48.00, "Midland Energy Supply Yard", "Permian Basin"]
];

for (const item of inventoryData) {
  insertItem.run(...item);
}

// Seed Freight Lanes & Hotshot Rates
const insertLane = db.prepare(`
  INSERT INTO hotshot_freight_lanes (origin_hub, destination_hub, corridor, avg_rate_per_mile, expedited_rate_per_mile, equipment_type, lead_time_hours, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const laneData = [
  ["Dallas / Ft. Worth", "Houston", "I-45 Corridor", 2.25, 3.50, "40ft Gooseneck Flatbed", 4, "ACTIVE_AVAILABLE"],
  ["Dallas / Ft. Worth", "Austin", "I-35 South", 2.40, 3.75, "40ft Gooseneck Flatbed", 3, "ACTIVE_AVAILABLE"],
  ["Dallas / Ft. Worth", "Midland / Odessa", "I-20 West (Permian)", 2.80, 4.25, "Heavy Haul Lowboy", 6, "HIGH_DEMAND"],
  ["Houston", "San Antonio", "I-10 West", 2.15, 3.20, "32ft Hotshot Flatbed", 4, "ACTIVE_AVAILABLE"],
  ["Denton", "Waco", "I-35 Central", 2.10, 3.10, "Single Axle Stakebed", 2, "ACTIVE_AVAILABLE"]
];

for (const lane of laneData) {
  insertLane.run(...lane);
}

console.log("? Aurelius Node 01 Matrix Populated Successfully!");
