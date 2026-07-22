import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import "dotenv/config";
import { verifyPaymentAuthorization, RECEIVER_WALLET } from "./utils/crypto.js";
import { db, initDatabase, seedSampleData } from "./db/database.js";

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

// 🔄 Background Oracle Cycle (Populates and updates inventory)
function runOracleCycle() {
  try {
    const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);

    // Seed initial inventory if empty
    const countRow = db.prepare("SELECT COUNT(*) as cnt FROM inventory").get() as { cnt: number };
    if (!countRow || countRow.cnt === 0) {
      console.log("🌱 [DATABASE SEED] Inserting initial ground-truth inventory...");
      db.prepare(`
        INSERT INTO inventory (item_name, category, stock_level, unit_price_usd) VALUES
        ('3/4" Structural Steel Plate (A36)', 'Metals', 142, '850.00'),
        ('Schedule 40 Carbon Steel Pipe 4"', 'Piping', 88, '42.50'),
        ('Class 300 Flanged Gate Valves 2"', 'Valves', 34, '310.00'),
        ('SYP #2 Structural Lumber 2x6x16', 'Lumber', 520, '14.25'),
        ('Crushed Texas Limestone (Base Grade 2)', 'Aggregates', 1200, '22.00'),
        ('Type I/II Portland Cement (94lb Bags)', 'Cement', 310, '16.50')
      `).run();
    }

    // Dynamic market update simulation
    const steelDelta = Math.floor(Math.random() * 5) - 2;
    db.prepare(
      "UPDATE inventory SET stock_level = MAX(10, stock_level + ?), updated_at = ? WHERE id = 1"
    ).run(steelDelta, timestamp);

    console.log(`🔄 [ORACLE CYCLE] Live inventory updated | Steel Delta: ${steelDelta >= 0 ? '+' : ''}${steelDelta} | Sync: ${timestamp}`);
  } catch (err: any) {
    console.error("❌ [ORACLE CYCLE ERROR]:", err.message);
  }
}

// Run initial cycle & schedule background updates every 15 seconds
runOracleCycle();
setInterval(runOracleCycle, 15000);

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

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 [AURELIUS NODE 01] FULL DECK ONLINE AT PORT ${PORT}`);
  console.log(`📡 Manifest: http://localhost:${PORT}/.well-known/agent.json`);
  console.log(`💳 Tollbooth: $0.05 USDC per query (Base Mainnet)`);
  console.log(`==================================================\n`);
});