import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import "dotenv/config";
import { db } from "./db/database";
import { verifyPaymentAuthorization, RECEIVER_WALLET } from "./utils/crypto";
import { runOracleHarvest } from "./scraper";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

// 🛠️ Ensure ALL tables exist & are seeded before running cycles
db.exec(`
  CREATE TABLE IF NOT EXISTS industrial_inventory (
    id INTEGER PRIMARY KEY,
    item_name TEXT,
    category TEXT,
    stock_level INTEGER,
    unit_price_usd TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS fuel_prices (
    id INTEGER PRIMARY KEY,
    location TEXT,
    diesel_rack_usd TEXT,
    gas_unleaded_usd TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS hotshot_freight_lanes (
    id INTEGER PRIMARY KEY,
    lane_name TEXT,
    expedited_rate_per_mile TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS payment_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payer_address TEXT NOT NULL,
    recipient_address TEXT NOT NULL,
    amount_usd TEXT NOT NULL,
    tx_status TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Seed fuel prices if empty
  INSERT OR IGNORE INTO fuel_prices (id, location, diesel_rack_usd, gas_unleaded_usd, updated_at) VALUES 
  (1, 'DFW Terminal (Irving)', '3.45', '2.92', datetime('now')),
  (2, 'Houston Ship Channel', '3.35', '2.79', datetime('now')),
  (3, 'Permian Hub (Midland)', '3.68', '3.12', datetime('now')),
  (4, 'San Antonio Terminal', '3.40', '2.85', datetime('now'));

  -- Seed inventory if empty
  INSERT OR IGNORE INTO industrial_inventory (id, item_name, category, stock_level, unit_price_usd, updated_at) VALUES
  (1, '3/4" Structural Steel Plate (A36)', 'Metals', 142, '850.00', datetime('now')),
  (2, 'Schedule 40 Carbon Steel Pipe 4"', 'Piping', 88, '42.50', datetime('now')),
  (3, 'Class 300 Flanged Gate Valves 2"', 'Valves', 34, '310.00', datetime('now')),
  (4, 'SYP #2 Structural Lumber 2x6x16', 'Lumber', 520, '14.25', datetime('now')),
  (5, 'Crushed Texas Limestone (Base Grade 2)', 'Aggregates', 1200, '22.00', datetime('now')),
  (6, 'Type I/II Portland Cement (94lb Bags)', 'Cement', 310, '16.50', datetime('now'));

  -- Seed freight lanes if empty
  INSERT OR IGNORE INTO hotshot_freight_lanes (id, lane_name, expedited_rate_per_mile, updated_at) VALUES
  (1, 'Dallas/Fort Worth -> Houston Corridor', '3.85', datetime('now')),
  (2, 'Midland/Odessa -> Houston (Permian Basin)', '4.20', datetime('now')),
  (3, 'San Antonio -> Laredo (Border Freight)', '3.65', datetime('now'));
`);

// 🔄 Background Oracle Cycle (Pulls EIA, FRED, & Scraped Data)
async function runOracleCycle() {
  try {
    const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
    const items = await runOracleHarvest();

    for (const item of items) {
      if (item.category === "Fuel" && item.value) {
        db.prepare(`
          UPDATE fuel_prices 
          SET diesel_rack_usd = ?, updated_at = ? 
          WHERE location LIKE '%Houston%' OR location LIKE '%DFW%'
        `).run(item.value, timestamp);

        console.log(`  [ORACLE SYNC] ${item.name} -> $${item.value} (${item.source})`);
      }

      if (item.category === "Metals Index" && item.value) {
        db.prepare(`
          UPDATE industrial_inventory 
          SET unit_price_usd = ?, updated_at = ? 
          WHERE item_name LIKE '%Structural Steel%'
        `).run(item.value, timestamp);

        console.log(`  [ORACLE SYNC] ${item.name} -> ${item.value} (${item.source})`);
      }
    }

    console.log(`🔄 [ORACLE CYCLE COMPLETE] Baseline Ground-Truth Synced | ${timestamp}`);
  } catch (err: any) {
    console.error("❌ [ORACLE CYCLE ERROR]:", err.message);
  }
}

// Run initial cycle & schedule background updates every 30 seconds
runOracleCycle();
setInterval(runOracleCycle, 30000);

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

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 [AURELIUS NODE 01] FULL DECK ONLINE AT PORT ${PORT}`);
  console.log(`📡 Manifest: http://localhost:${PORT}/.well-known/agent.json`);
  console.log(`💳 Tollbooth: $0.05 USDC per query (Base Mainnet)`);
  console.log(`==================================================\n`);
});