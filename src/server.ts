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
// 1. Create or Upgrade Table Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS industrial_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name TEXT UNIQUE,
    category TEXT,
    stock_level INTEGER,
    unit_price_usd REAL,
    unit_of_measure TEXT,
    spec_grade TEXT,
    hub_name TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    lat REAL,
    lng REAL,
    weight_lbs_per_unit REAL,
    length_ft REAL,
    availability_type TEXT,
    lead_time_hours INTEGER,
    hazmat BOOLEAN,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 🌾 Seed Ground-Truth Data (36-Item Texas Master Matrix)
export const seedInventoryMaster = [
  // --------------------------------------------------------------------------
  // 1. METALS & STRUCTURAL
  // --------------------------------------------------------------------------
  {
    item_name: "3/4\" Structural Steel Plate (A36)",
    category: "Metals",
    stock_level: 142,
    unit_price_usd: 361.40,
    unit_of_measure: "4x8 Sheet",
    spec_grade: "ASTM A36 Hot Rolled",
    hub_name: "DFW Industrial Steel Yard",
    city: "Fort Worth",
    state: "TX",
    zip_code: "76102",
    lat: 32.7555,
    lng: -97.3308,
    weight_lbs_per_unit: 980.0, // 30.63 lb/sqft * 32 sqft
    length_ft: 8.0,
    availability_type: "Immediate Hotshot Dispatch",
    lead_time_hours: 0,
    hazmat: false
  },
  {
    item_name: "Schedule 40 Carbon Steel Pipe 4\"",
    category: "Piping",
    stock_level: 88,
    unit_price_usd: 42.50,
    unit_of_measure: "Linear Foot",
    spec_grade: "ASTM A53 Grade B / Seamless",
    hub_name: "DFW Industrial Steel Yard",
    city: "Fort Worth",
    state: "TX",
    zip_code: "76102",
    lat: 32.7555,
    lng: -97.3308,
    weight_lbs_per_unit: 10.79, // ~10.79 lbs/ft
    length_ft: 20.0,
    availability_type: "Immediate Hotshot Dispatch",
    lead_time_hours: 0,
    hazmat: false
  },
  {
    item_name: "Class 300 Flanged Gate Valves 2\"",
    category: "Valves",
    stock_level: 34,
    unit_price_usd: 310.00,
    unit_of_measure: "Unit",
    spec_grade: "API 600 / Cast Steel A216 WCB",
    hub_name: "Houston Ship Channel Valve Hub",
    city: "Pasadena",
    state: "TX",
    zip_code: "77506",
    lat: 29.7052,
    lng: -95.2091,
    weight_lbs_per_unit: 46.0,
    length_ft: 1.0,
    availability_type: "Immediate Hotshot Dispatch",
    lead_time_hours: 0,
    hazmat: false
  },
  {
    item_name: "Grade 60 Rebar #5 (20ft Lengths)",
    category: "Metals",
    stock_level: 850,
    unit_price_usd: 12.80,
    unit_of_measure: "20ft Stick",
    spec_grade: "ASTM A615 Grade 60",
    hub_name: "San Antonio Supply Hub",
    city: "San Antonio",
    state: "TX",
    zip_code: "78219",
    lat: 29.4241,
    lng: -98.4936,
    weight_lbs_per_unit: 20.86,
    length_ft: 20.0,
    availability_type: "Immediate Hotshot Dispatch",
    lead_time_hours: 0,
    hazmat: false
  },
  {
    item_name: "Schedule 80 316L Stainless Pipe 2\"",
    category: "Piping",
    stock_level: 64,
    unit_price_usd: 88.50,
    unit_of_measure: "Linear Foot",
    spec_grade: "ASTM A312 TP316L / Seamless",
    hub_name: "Houston Ship Channel Valve Hub",
    city: "Pasadena",
    state: "TX",
    zip_code: "77506",
    lat: 29.7052,
    lng: -95.2091,
    weight_lbs_per_unit: 5.02,
    length_ft: 20.0,
    availability_type: "Immediate Hotshot Dispatch",
    lead_time_hours: 0,
    hazmat: false
  },

  // --------------------------------------------------------------------------
  // 2. LUMBER & BUILDING MATERIALS
  // --------------------------------------------------------------------------
  {
    item_name: "SYP #2 Structural Lumber 2x6x16",
    category: "Lumber",
    stock_level: 520,
    unit_price_usd: 14.25,
    unit_of_measure: "Board",
    spec_grade: "Southern Yellow Pine #2 Prime",
    hub_name: "Central Texas Lumber Yard",
    city: "Conroe",
    state: "TX",
    zip_code: "77301",
    lat: 30.3119,
    lng: -95.4560,
    weight_lbs_per_unit: 24.5,
    length_ft: 16.0,
    availability_type: "Immediate Yard Pick-up",
    lead_time_hours: 0,
    hazmat: false
  },
  {
    item_name: "3/4\" CDX Plywood Sheathing 4x8",
    category: "Lumber",
    stock_level: 310,
    unit_price_usd: 29.50,
    unit_of_measure: "Sheet",
    spec_grade: "APA Rated CDX Pine",
    hub_name: "Central Texas Lumber Yard",
    city: "Conroe",
    state: "TX",
    zip_code: "77301",
    lat: 30.3119,
    lng: -95.4560,
    weight_lbs_per_unit: 70.0,
    length_ft: 8.0,
    availability_type: "Immediate Yard Pick-up",
    lead_time_hours: 0,
    hazmat: false
  },

  // --------------------------------------------------------------------------
  // 3. CONCRETE, AGGREGATES & INFRASTRUCTURE
  // --------------------------------------------------------------------------
  {
    item_name: "Crushed Texas Limestone (Base Grade 2)",
    category: "Aggregates",
    stock_level: 1200,
    unit_price_usd: 22.00,
    unit_of_measure: "Ton",
    spec_grade: "TxDOT Item 247 Grade 2",
    hub_name: "Central Texas Aggregate Quarry",
    city: "New Braunfels",
    state: "TX",
    zip_code: "78130",
    lat: 29.7030,
    lng: -98.1245,
    weight_lbs_per_unit: 2000.0,
    length_ft: 0.0,
    availability_type: "Bulk End-Dump Dispatch",
    lead_time_hours: 2,
    hazmat: false
  },
  {
    item_name: "Type I/II Portland Cement (94lb Bags)",
    category: "Cement",
    stock_level: 310,
    unit_price_usd: 16.50,
    unit_of_measure: "Bag",
    spec_grade: "ASTM C150 Type I/II",
    hub_name: "DFW Industrial Steel Yard",
    city: "Fort Worth",
    state: "TX",
    zip_code: "76102",
    lat: 32.7555,
    lng: -97.3308,
    weight_lbs_per_unit: 94.0,
    length_ft: 1.5,
    availability_type: "Immediate Pallet Pick-up",
    lead_time_hours: 0,
    hazmat: false
  },
  {
    item_name: "Ready-Mix Structural Concrete (4000 PSI / Yard)",
    category: "Concrete",
    stock_level: 450,
    unit_price_usd: 145.00,
    unit_of_measure: "Cubic Yard",
    spec_grade: "TxDOT Class A 4000 PSI Mix",
    hub_name: "Dallas Metro Ready-Mix Plant",
    city: "Dallas",
    state: "TX",
    zip_code: "75212",
    lat: 32.7767,
    lng: -96.7970,
    weight_lbs_per_unit: 4000.0,
    length_ft: 0.0,
    availability_type: "Batch Truck Dispatch",
    lead_time_hours: 4,
    hazmat: false
  },
  {
    item_name: "High-Strength Precision Grout (50lb Bag)",
    category: "Concrete",
    stock_level: 280,
    unit_price_usd: 24.50,
    unit_of_measure: "Bag",
    spec_grade: "ASTM C1107 Non-Shrink",
    hub_name: "San Antonio Supply Hub",
    city: "San Antonio",
    state: "TX",
    zip_code: "78219",
    lat: 29.4241,
    lng: -98.4936,
    weight_lbs_per_unit: 50.0,
    length_ft: 1.2,
    availability_type: "Immediate Hotshot Dispatch",
    lead_time_hours: 0,
    hazmat: false
  },
  {
    item_name: "TxDOT Spec Pre-Stressed Concrete Beam (50ft)",
    category: "Infrastructure",
    stock_level: 18,
    unit_price_usd: 4200.00,
    unit_of_measure: "Beam Unit",
    spec_grade: "TxDOT Type Tx28 Girder / 6000 PSI",
    hub_name: "Central Texas Precast Plant",
    city: "Victoria",
    state: "TX",
    zip_code: "77901",
    lat: 28.8053,
    lng: -96.9872,
    weight_lbs_per_unit: 28500.0,
    length_ft: 50.0,
    availability_type: "Heavy Haul Oversize Permit Rig",
    lead_time_hours: 24,
    hazmat: false
  },

  // --------------------------------------------------------------------------
  // 4. ENERGY, OILFIELD & ERCOT GRID
  // --------------------------------------------------------------------------
  {
    item_name: "13-3/8\" API Spec Casing Pipe (OCTG)",
    category: "Oilfield",
    stock_level: 65,
    unit_price_usd: 185.00,
    unit_of_measure: "Linear Foot",
    spec_grade: "API 5CT Grade J55 / BTC",
    hub_name: "Permian Basin OCTG Pipe Yard",
    city: "Odessa",
    state: "TX",
    zip_code: "79761",
    lat: 31.8457,
    lng: -102.3676,
    weight_lbs_per_unit: 54.5,
    length_ft: 40.0,
    availability_type: "Immediate Oilfield Hotshot",
    lead_time_hours: 0,
    hazmat: false
  },
  {
    item_name: "API Drilling Mud / Bentonite (100lb Bag)",
    category: "Oilfield",
    stock_level: 900,
    unit_price_usd: 18.50,
    unit_of_measure: "Bag",
    spec_grade: "API Spec 13A Section 9",
    hub_name: "Permian Basin OCTG Pipe Yard",
    city: "Odessa",
    state: "TX",
    zip_code: "79761",
    lat: 31.8457,
    lng: -102.3676,
    weight_lbs_per_unit: 100.0,
    length_ft: 2.0,
    availability_type: "Immediate Hotshot Dispatch",
    lead_time_hours: 0,
    hazmat: false
  },
  {
    item_name: "High-Pressure 2\" Swivel Joint 1502",
    category: "Oilfield",
    stock_level: 28,
    unit_price_usd: 850.00,
    unit_of_measure: "Unit",
    spec_grade: "15,000 PSI CWP / FMC Style",
    hub_name: "Permian Basin OCTG Pipe Yard",
    city: "Odessa",
    state: "TX",
    zip_code: "79761",
    lat: 31.8457,
    lng: -102.3676,
    weight_lbs_per_unit: 32.0,
    length_ft: 1.5,
    availability_type: "Immediate Hotshot Dispatch",
    lead_time_hours: 0,
    hazmat: false
  },
  {
    item_name: "Utility-Scale Solar Racking Rail (14ft Alum)",
    category: "Renewables",
    stock_level: 340,
    unit_price_usd: 68.00,
    unit_of_measure: "Rail Unit",
    spec_grade: "6005-T5 Anodized Aluminum",
    hub_name: "West Texas Solar Logistics Yard",
    city: "Abilene",
    state: "TX",
    zip_code: "79601",
    lat: 32.4487,
    lng: -99.7331,
    weight_lbs_per_unit: 18.2,
    length_ft: 14.0,
    availability_type: "Immediate Flatbed Dispatch",
    lead_time_hours: 0,
    hazmat: false
  },
  {
    item_name: "3/0 AWG Bare Copper Grounding Wire (ft)",
    category: "Electrical",
    stock_level: 1500,
    unit_price_usd: 4.25,
    unit_of_measure: "Linear Foot",
    spec_grade: "ASTM B8 Soft Drawn Copper",
    hub_name: "Austin Tech Corridor Yard",
    city: "Round Rock",
    state: "TX",
    zip_code: "78664",
    lat: 30.5083,
    lng: -97.6789,
    weight_lbs_per_unit: 0.518,
    length_ft: 1000.0,
    availability_type: "Immediate Hotshot Dispatch",
    lead_time_hours: 0,
    hazmat: false
  },
  {
    item_name: "Grid-Scale BESS Battery Rack (250kWh Unit)",
    category: "Renewables",
    stock_level: 6,
    unit_price_usd: 45000.00,
    unit_of_measure: "Rack System",
    spec_grade: "LFP Chemistry / UL 1973 Certified",
    hub_name: "Austin Tech Corridor Yard",
    city: "Round Rock",
    state: "TX",
    zip_code: "78664",
    lat: 30.5083,
    lng: -97.6789,
    weight_lbs_per_unit: 4800.0,
    length_ft: 7.5,
    availability_type: "Specialized Hazmat/Heavy Freight",
    lead_time_hours: 12,
    hazmat: true
  },
  {
    item_name: "Wind Turbine Lube Oil ISO VG 46 (55 Gal)",
    category: "Renewables",
    stock_level: 32,
    unit_price_usd: 680.00,
    unit_of_measure: "55-Gal Drum",
    spec_grade: "Synthetic PAO / ISO VG 46",
    hub_name: "Panhandle Wind Corridor Depot",
    city: "Amarillo",
    state: "TX",
    zip_code: "79101",
    lat: 35.2220,
    lng: -101.8313,
    weight_lbs_per_unit: 440.0,
    length_ft: 3.0,
    availability_type: "Immediate Hotshot Dispatch",
    lead_time_hours: 0,
    hazmat: false
  },
  {
    item_name: "10,000 Gal Poly Water Storage Tank",
    category: "Oilfield",
    stock_level: 12,
    unit_price_usd: 5400.00,
    unit_of_measure: "Tank Unit",
    spec_grade: "HDPE ASTM D1998 / 1.5 SPG",
    hub_name: "Permian Basin OCTG Pipe Yard",
    city: "Odessa",
    state: "TX",
    zip_code: "79761",
    lat: 31.8457,
    lng: -102.3676,
    weight_lbs_per_unit: 2200.0,
    length_ft: 14.0,
    availability_type: "Oversize Flatbed Rig",
    lead_time_hours: 6,
    hazmat: false
  },

  // --------------------------------------------------------------------------
  // 5. DATA CENTER & TECH CORRIDOR
  // --------------------------------------------------------------------------
  {
    item_name: "4\" PVC Electrical Conduit Sch 40 (10ft)",
    category: "Electrical",
    stock_level: 620,
    unit_price_usd: 18.90,
    unit_of_measure: "10ft Length",
    spec_grade: "NEMA TC-2 / UL 651",
    hub_name: "Austin Tech Corridor Yard",
    city: "Round Rock",
    state: "TX",
    zip_code: "78664",
    lat: 30.5083,
    lng: -97.6789,
    weight_lbs_per_unit: 23.1,
    length_ft: 10.0,
    availability_type: "Immediate Yard Pick-up",
    lead_time_hours: 0,
    hazmat: false
  },
  {
    item_name: "Cat6A Shielded Plenum Cable (1000ft Spool)",
    category: "Telecom",
    stock_level: 115,
    unit_price_usd: 285.00,
    unit_of_measure: "1000ft Spool",
    spec_grade: "CMP Plenum Rated / 10Gbps TIA-568-C.2",
    hub_name: "DFW Industrial Steel Yard",
    city: "Fort Worth",
    state: "TX",
    zip_code: "76102",
    lat: 32.7555,
    lng: -97.3308,
    weight_lbs_per_unit: 42.0,
    length_ft: 1.5,
    availability_type: "Immediate Hotshot Dispatch",
    lead_time_hours: 0,
    hazmat: false
  },
  {
    item_name: "Commercial Transformer Oil (55 Gal Drum)",
    category: "Electrical",
    stock_level: 45,
    unit_price_usd: 420.00,
    unit_of_measure: "55-Gal Drum",
    spec_grade: "ASTM D3487 Type II Mineral Oil",
    hub_name: "Houston Ship Channel Valve Hub",
    city: "Pasadena",
    state: "TX",
    zip_code: "77506",
    lat: 29.7052,
    lng: -95.2091,
    weight_lbs_per_unit: 435.0,
    length_ft: 3.0,
    availability_type: "Immediate Hotshot Dispatch",
    lead_time_hours: 0,
    hazmat: false
  },
  {
    item_name: "100mm HDPE Utility Conduit Roll (1000ft)",
    category: "Electrical",
    stock_level: 22,
    unit_price_usd: 1250.00,
    unit_of_measure: "1000ft Continuous Roll",
    spec_grade: "SDR 11 / ASTM F2160",
    hub_name: "Austin Tech Corridor Yard",
    city: "Round Rock",
    state: "TX",
    zip_code: "78664",
    lat: 30.5083,
    lng: -97.6789,
    weight_lbs_per_unit: 680.0,
    length_ft: 6.0, // Coil diameter
    availability_type: "Flatbed Hotshot",
    lead_time_hours: 2,
    hazmat: false
  },

  // --------------------------------------------------------------------------
  // 6. AGRIBUSINESS & INDUSTRIAL CHEMICALS
  // --------------------------------------------------------------------------
  {
    item_name: "Anhydrous Ammonia Fertilizer (Ton)",
    category: "Agriculture",
    stock_level: 40,
    unit_price_usd: 620.00,
    unit_of_measure: "Ton",
    spec_grade: "Commercial Grade 82-0-0 N",
    hub_name: "Panhandle Agricultural Supply",
    city: "Lubbock",
    state: "TX",
    zip_code: "79401",
    lat: 33.5779,
    lng: -101.8552,
    weight_lbs_per_unit: 2000.0,
    length_ft: 0.0,
    availability_type: "Pressurized Tanker Transport",
    lead_time_hours: 4,
    hazmat: true
  }
];

// 2. Insert or Update Master Matrix
const seedStmt = db.prepare(`
  INSERT INTO industrial_inventory (
    item_name, category, stock_level, unit_price_usd, unit_of_measure,
    spec_grade, hub_name, city, state, zip_code, lat, lng,
    weight_lbs_per_unit, length_ft, availability_type, lead_time_hours, hazmat
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
  ON CONFLICT(item_name) DO UPDATE SET
    stock_level = excluded.stock_level,
    unit_price_usd = excluded.unit_price_usd,
    category = excluded.category,
    spec_grade = excluded.spec_grade,
    hub_name = excluded.hub_name,
    availability_type = excluded.availability_type,
    updated_at = CURRENT_TIMESTAMP
`);

for (const item of seedInventoryMaster) {
  seedStmt.run(
    item.item_name, item.category, item.stock_level, item.unit_price_usd,
    item.unit_of_measure, item.spec_grade, item.hub_name, item.city,
    item.state, item.zip_code, item.lat, item.lng, item.weight_lbs_per_unit,
    item.length_ft, item.availability_type, item.lead_time_hours, item.hazmat ? 1 : 0
  );
}

// 🔄 Expanded Background Oracle Cycle
async function runOracleCycle() {
  try {
    const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
    const items = await runOracleHarvest();

    for (const item of items) {
      // 1. Fuel Terminals (EIA)
      if (item.category === "Fuel" && item.value) {
        db.prepare(`
          UPDATE fuel_prices 
          SET diesel_rack_usd = ?, updated_at = ? 
          WHERE location LIKE '%Houston%' OR location LIKE '%DFW%' OR location LIKE '%Permian%'
        `).run(item.value, timestamp);
      }

      // 2. Metals & Steel (FRED)
      if (item.category === "Metals Index" && item.value) {
        db.prepare(`
          UPDATE industrial_inventory 
          SET unit_price_usd = ?, updated_at = ? 
          WHERE category IN ('Metals', 'Piping', 'Valves', 'Oilfield')
        `).run(item.value, timestamp);
      }

      // 3. Lumber & Sheathing (FRED)
      if (item.category === "Lumber Index" && item.value) {
        db.prepare(`
          UPDATE industrial_inventory 
          SET unit_price_usd = ?, updated_at = ? 
          WHERE category = 'Lumber'
        `).run(item.value, timestamp);
      }

      // 4. Concrete & Aggregates (FRED)
      if (item.category === "Concrete Index" && item.value) {
        db.prepare(`
          UPDATE industrial_inventory 
          SET unit_price_usd = ?, updated_at = ? 
          WHERE category IN ('Concrete', 'Cement', 'Aggregates')
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