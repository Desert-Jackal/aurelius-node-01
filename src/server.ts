import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import "dotenv/config";
import { db } from "./db/database";
import { verifyPaymentAuthorization, RECEIVER_WALLET } from "./utils/crypto";
import { scrapeLiveFuelPrices } from "./scraper";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

// Ensure payment ledger table exists
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

// 🔄 Background Oracle Cycle (Syncs scraped data into fuel_prices table)
async function runOracleCycle() {
  try {
    const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);

    // Fetch live fuel prices from public web scraper
    const liveItems = await scrapeLiveFuelPrices();

    if (liveItems.length > 0) {
      const stmt = db.prepare(`
        UPDATE fuel_prices 
        SET diesel_rack_usd = ?, updated_at = ? 
        WHERE location LIKE '%Houston%'
      `);

      for (const item of liveItems) {
        stmt.run(item.unit_price_usd, timestamp);
        console.log(`  [SCRAPED DATA SYNC] Houston Diesel Rack -> $${item.unit_price_usd}/gal`);
      }
    }

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