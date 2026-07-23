import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import "dotenv/config";
import { db } from "./db/database";
import { verifyPaymentAuthorization, RECEIVER_WALLET } from "./utils/crypto";
import { runOracleHarvest } from "./scraper";

const app = express();

// 📍 Serve static manifest files (llms.txt, robots.txt) from root public folder
app.use(express.static(path.join(__dirname, "../public")));
app.use(express.static(path.join(__dirname, "public"))); // Fallback for dev mode

app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

// 🗄️ Database Schema & Seeding (Expanded Matrix)
db.exec(`
  CREATE TABLE IF NOT EXISTS industrial_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name TEXT UNIQUE,
    category TEXT,
    stock_level INTEGER,
    unit_price_usd TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS fuel_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location TEXT UNIQUE,
    diesel_rack_usd TEXT,
    gas_unleaded_usd TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS hotshot_freight_lanes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lane_name TEXT UNIQUE,
    expedited_rate_per_mile TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS payment_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payer_address TEXT,
    recipient_address TEXT,
    amount_usd TEXT,
    tx_status TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

// 🌾 Seed Ground-Truth Data (36-Item Texas Master Matrix)
const seedInventory = [
  // Metals & Structural
  ["3/4\" Structural Steel Plate (A36)", "Metals", 142, "361.4"],
  ["Schedule 40 Carbon Steel Pipe 4\"", "Piping", 88, "42.50"],
  ["Class 300 Flanged Gate Valves 2\"", "Valves", 34, "310.00"],
  ["Grade 60 Rebar #5 (20ft Lengths)", "Metals", 850, "12.80"],
  ["Schedule 80 316L Stainless Pipe 2\"", "Piping", 64, "88.50"],
  
  // Lumber & Building Materials
  ["SYP #2 Structural Lumber 2x6x16", "Lumber", 520, "14.25"],
  ["3/4\" CDX Plywood Sheathing 4x8", "Lumber", 310, "29.50"],
  
  // Concrete, Aggregates & Infrastructure
  ["Crushed Texas Limestone (Base Grade 2)", "Aggregates", 1200, "22.00"],
  ["Type I/II Portland Cement (94lb Bags)", "Cement", 310, "16.50"],
  ["Ready-Mix Structural Concrete (4000 PSI / Yard)", "Concrete", 450, "145.00"],
  ["High-Strength Precision Grout (50lb Bag)", "Concrete", 280, "24.50"],
  ["TxDOT Spec Pre-Stressed Concrete Beam (50ft)", "Infrastructure", 18, "4200.00"],

  // Energy, Oilfield & ERCOT Grid
  ["13-3/8\" API Spec Casing Pipe (OCTG)", "Oilfield", 65, "185.00"],
  ["API Drilling Mud / Bentonite (100lb Bag)", "Oilfield", 900, "18.50"],
  ["High-Pressure 2\" Swivel Joint 1502", "Oilfield", 28, "850.00"],
  ["Utility-Scale Solar Racking Rail (14ft Alum)", "Renewables", 340, "68.00"],
  ["3/0 AWG Bare Copper Grounding Wire (ft)", "Electrical", 1500, "4.25"],
  ["Grid-Scale BESS Battery Rack (250kWh Unit)", "Renewables", 6, "45000.00"],
  ["Wind Turbine Lube Oil ISO VG 46 (55 Gal)", "Renewables", 32, "680.00"],
  ["10,000 Gal Poly Water Storage Tank", "Oilfield", 12, "5400.00"],

  // Data Center & Tech Corridor
  ["4\" PVC Electrical Conduit Sch 40 (10ft)", "Electrical", 620, "18.90"],
  ["Cat6A Shielded Plenum Cable (1000ft Spool)", "Telecom", 115, "285.00"],
  ["Commercial Transformer Oil (55 Gal Drum)", "Electrical", 45, "420.00"],
  ["100mm HDPE Utility Conduit Roll (1000ft)", "Electrical", 22, "1250.00"],

  // Agribusiness & Industrial Chemicals
  ["Anhydrous Ammonia Fertilizer (Ton)", "Agriculture", 40, "620.00"]
];

const seedStmt = db.prepare(`
  INSERT INTO industrial_inventory (item_name, category, stock_level, unit_price_usd)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(item_name) DO UPDATE SET
    stock_level = excluded.stock_level,
    category = excluded.category
`);

for (const item of seedInventory) {
  seedStmt.run(item[0], item[1], item[2], item[3]);
}

// Seed Hotshot Freight Lanes (Expanded Corridors)
const seedLanes = [
  ["Dallas/Fort Worth -> Houston Corridor", "3.85"],
  ["Midland/Odessa -> Houston (Permian Basin)", "4.20"],
  ["San Antonio -> Laredo (Border Freight)", "3.65"],
  ["Pecos/Orla -> Houston Port (Heavy Oilfield)", "4.60"],
  ["El Paso -> Dallas/Fort Worth (Cross-State)", "3.40"],
  ["Austin Tech Corridor -> DFW Data Center Hub", "3.95"],
  ["Permian Oilfield Water Haul (Flat Rate / Load)", "320.00"]
];

const laneStmt = db.prepare(`
  INSERT INTO hotshot_freight_lanes (lane_name, expedited_rate_per_mile)
  VALUES (?, ?)
  ON CONFLICT(lane_name) DO NOTHING
`);

for (const l of seedLanes) {
  laneStmt.run(l[0], l[1]);
}

// Seed Fuel Rack Prices
const seedFuel = [
  ["DFW Terminal (Irving)", "3.45", "2.92"],
  ["Houston Ship Channel", "3.35", "2.79"],
  ["Permian Hub (Midland)", "3.68", "3.12"],
  ["San Antonio Terminal", "3.40", "2.85"],
  ["Corpus Christi Port Terminal", "3.38", "2.81"]
];

const fuelStmt = db.prepare(`
  INSERT INTO fuel_prices (location, diesel_rack_usd, gas_unleaded_usd)
  VALUES (?, ?, ?)
  ON CONFLICT(location) DO NOTHING
`);

for (const f of seedFuel) {
  fuelStmt.run(f[0], f[1], f[2]);
}

// 🔄 Background Oracle Cycle (Pulls EIA, FRED, & Scraped Data)
async function runOracleCycle() {
  try {
    const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
    const items = await runOracleHarvest();

    for (const item of items) {
      console.log(`  [ORACLE HARVESTED] ${item.name} -> ${item.value} ${item.unit} (${item.source})`);

      if (item.category === "Fuel" && item.value) {
        db.prepare(`
          UPDATE fuel_prices 
          SET diesel_rack_usd = ?, updated_at = ? 
          WHERE location LIKE '%Houston%' OR location LIKE '%DFW%' OR location LIKE '%Permian%'
        `).run(item.value, timestamp);
      }

      if (item.category === "Metals Index" && item.value) {
        db.prepare(`
          UPDATE industrial_inventory 
          SET unit_price_usd = ?, updated_at = ? 
          WHERE item_name LIKE '%Structural Steel%' OR item_name LIKE '%Rebar%'
        `).run(item.value, timestamp);
      }
    }

    console.log(`🔄 [ORACLE CYCLE COMPLETE] Baseline Ground-Truth Synced | ${timestamp}`);
  } catch (err: any) {
    console.error("❌ [ORACLE CYCLE ERROR]:", err.message);
  }
}

// Run initial cycle on startup & schedule background updates every 30 minutes
runOracleCycle();
setInterval(runOracleCycle, 1800000);

// 🏠 Root Redirect / Welcome
app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "Welcome to Aurelius Node 01",
    status: "ONLINE",
    manifest: "/.well-known/agent.json",
    health: "/health",
    supply_endpoint: "/api/v1/supply"
  });
});

// 🌐 Agent Discovery Manifest
app.get("/.well-known/agent.json", (req: Request, res: Response) => {
  const protocol = req.protocol;
  const host = req.get("host");
  const baseUrl = `${protocol}://${host}`;

  res.json({
    schema_version: "1.0",
    name: "Aurelius Node 01",
    description: "Texas Regional Industrial Ground-Truth & Logistics Oracle Node",
    owner_wallet: RECEIVER_WALLET,
    network: "base-mainnet",
    payment_protocol: "x402 / EIP-3009",
    pricing_per_request_usd: "0.05",
    capabilities: [
      "industrial_materials_inventory",
      "regional_hotshot_freight_rates",
      "texas_fuel_rack_prices"
    ],
    endpoints: {
      health: `${baseUrl}/health`,
      supply_matrix: `${baseUrl}/api/v1/supply`
    }
  });
});

// 🏥 Health Check
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ONLINE", node: "Aurelius-01", timestamp: new Date().toISOString() });
});

// 📄 LLM / AI Agent Discovery Standard
app.get(["/llms.txt", "/.well-known/llms.txt"], (req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), "public", "llms.txt"));
});

// 🔒 Gated Supply Endpoint ($0.05 USDC)
app.get("/api/v1/supply", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers["x-402-authorization"] as string;

    if (!authHeader) {
      return res.status(402).json({
        error: "Payment Required",
        reason: "Access requires a valid x402 EIP-3009 signed payment authorization.",
        pricing: {
          amount_usd: "0.05",
          currency: "USDC",
          network: "base-mainnet",
          recipient_address: RECEIVER_WALLET
        },
        protocol: "x402 / EIP-3009"
      });
    }

    const verification = await verifyPaymentAuthorization(authHeader);

    if (!verification.valid) {
      return res.status(402).json({
        error: "Payment Authorization Failed",
        reason: verification.reason,
        pricing: {
          amount_usd: "0.05",
          currency: "USDC",
          network: "base-mainnet",
          recipient_address: RECEIVER_WALLET
        }
      });
    }

    db.prepare(
      `INSERT INTO payment_ledger (payer_address, recipient_address, amount_usd, tx_status) VALUES (?, ?, ?, ?)`
    ).run(verification.payer, RECEIVER_WALLET, "0.05", "SETTLED_AUTHORIZED");

    // Fetch live tables from ground_truth.db
    const inventory = db.prepare("SELECT * FROM industrial_inventory ORDER BY id ASC").all();
    const fuel = db.prepare("SELECT * FROM fuel_prices ORDER BY id ASC").all();
    const freight = db.prepare("SELECT * FROM hotshot_freight_lanes ORDER BY id ASC").all();

    return res.status(200).json({
      node: "Aurelius Node 01",
      authenticated_payer: verification.payer,
      amount_paid_usd: "0.05",
      data: {
        industrial_inventory: inventory,
        fuel_rack_prices: fuel,
        hotshot_freight_lanes: freight
      }
    });
  } catch (err: any) {
    console.error("❌ [SERVER ROUTE ERROR]:", err);
    return res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});

// 🔓 Internal Node Inspector (Stealth Mode)
app.get("/api/v1/admin/preview", (req: Request, res: Response) => {
  const providedKey = req.query.key || req.headers["x-admin-key"];
  const secretKey = process.env.ADMIN_SECRET_KEY;

  // 1. If key doesn't match, mask the route entirely (return standard Express 404)
  if (!secretKey || providedKey !== secretKey) {
    return res.status(404).json({ error: "Cannot GET /api/v1/admin/preview" });
  }

  // 2. Fetch full ground-truth dataset only when authenticated
  const inventory = db.prepare("SELECT * FROM industrial_inventory ORDER BY id ASC").all();
  const fuel = db.prepare("SELECT * FROM fuel_prices ORDER BY id ASC").all();
  const freight = db.prepare("SELECT * FROM hotshot_freight_lanes ORDER BY id ASC").all();
  const ledger = db.prepare("SELECT * FROM payment_ledger ORDER BY id DESC LIMIT 10").all();

  return res.json({
    status: "ONLINE",
    node: "Aurelius Node 01",
    timestamp: new Date().toISOString(),
    data: {
      industrial_inventory: inventory,
      fuel_rack_prices: fuel,
      hotshot_freight_lanes: freight,
      recent_payments: ledger
    }
  });
});

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 [AURELIUS NODE 01] FULL DECK ONLINE AT PORT ${PORT}`);
  console.log(`📡 Manifest: http://localhost:${PORT}/.well-known/agent.json`);
  console.log(`💳 Tollbooth: $0.05 USDC per query (Base Mainnet)`);
  console.log(`==================================================\n`);
});