import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import "dotenv/config";
import { verifyPaymentAuthorization, RECEIVER_WALLET } from "./utils/crypto.js";
import { db, initDatabase, seedSampleData } from "./db/database.js";
import { scrapeLiveFuelPrices } from "./scraper.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

// Ensure base tables exist in SQLite
db.exec(`
  CREATE TABLE IF NOT EXISTS payment_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payer_address TEXT NOT NULL,
    recipient_address TEXT NOT NULL,
    amount_usd TEXT NOT NULL,
    tx_status TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name TEXT,
    category TEXT,
    stock_level INTEGER,
    unit_price_usd TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Initialize database schema & seed initial ground-truth tables
initDatabase();
seedSampleData();

// 🔄 Background Oracle Cycle (Populates live scraped data)
async function runOracleCycle() {
  try {
    const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);

    // Fetch live fuel prices from public web scraper
    const liveItems = await scrapeLiveFuelPrices();

    if (liveItems.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO inventory (item_name, category, stock_level, unit_price_usd)
        VALUES (?, ?, ?, ?)
      `);

      for (const item of liveItems) {
        stmt.run(item.item_name, item.category, item.stock_level, item.unit_price_usd);
        console.log(`  [SCRAPED DATA SYNC] ${item.item_name} -> $${item.unit_price_usd}/gal`);
      }
    }

    // Dynamic market update simulation for remaining material inventory
    const steelDelta = Math.floor(Math.random() * 5) - 2;
    db.prepare(
      "UPDATE inventory SET stock_level = MAX(10, stock_level + ?), updated_at = ? WHERE id = 1"
    ).run(steelDelta, timestamp);

    console.log(`🔄 [ORACLE CYCLE] Live inventory updated | Sync: ${timestamp}`);
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
      dashboard: `${baseUrl}/dashboard`,
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

    const inventory = db.prepare("SELECT * FROM inventory ORDER BY id ASC").all();

    return res.status(200).json({
      node: "Aurelius Node 01",
      authenticated_payer: verification.payer,
      amount_paid_usd: "0.05",
      record_count: inventory.length,
      data: inventory
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