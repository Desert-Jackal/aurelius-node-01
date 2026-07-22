import axios from "axios";
import * as cheerio from "cheerio";

export interface OracleItem {
  name: string;
  category: string;
  value: string;
  unit: string;
  source: string;
}

/**
 * ⛽ 1. EIA API: Gulf Coast Ultra-Low Sulfur Diesel Spot Price
 */
async function fetchEiaDieselPrice(): Promise<OracleItem | null> {
  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey) return null;

  try {
    // EIA v2 API route for U.S. Gulf Coast Diesel Spot Price
    const url = `https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=${apiKey}&frequency=daily&data[0]=value&facets[series][]=EER_EPD2D_PF4_RGC_DPG&sort[0][column]=period&sort[0][direction]=desc&length=1`;
    
    const response = await axios.get(url, { timeout: 5000 });
    const data = response.data?.response?.data?.[0];

    if (data && data.value) {
      return {
        name: "U.S. Gulf Coast Diesel (EIA Benchmark)",
        category: "Fuel",
        value: parseFloat(data.value).toFixed(2),
        unit: "USD/gal",
        source: "U.S. Energy Information Administration"
      };
    }
  } catch (err: any) {
    console.error("  ⚠️ [EIA API NOTICE]:", err.message);
  }
  return null;
}

/**
 * 🏭 2. FRED API: Producer Price Index for Structural Steel Mill Products
 */
async function fetchFredSteelIndex(): Promise<OracleItem | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;

  try {
    // FRED Series: WPU1017 (Steel Mill Products PPI)
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=WPU1017&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`;
    
    const response = await axios.get(url, { timeout: 5000 });
    const obs = response.data?.observations?.[0];

    if (obs && obs.value) {
      return {
        name: "Structural Steel PPI Index",
        category: "Metals Index",
        value: parseFloat(obs.value).toFixed(1),
        unit: "Index (1982=100)",
        source: "Federal Reserve Economic Data (FRED)"
      };
    }
  } catch (err: any) {
    console.error("  ⚠️ [FRED API NOTICE]:", err.message);
  }
  return null;
}

/**
 * 🌐 3. Web Scraper: Texas Local Fuel Spot Web Scraping Fallback
 */
export async function scrapeLiveFuelPrices(): Promise<OracleItem[]> {
  const items: OracleItem[] = [];

  try {
    const response = await axios.get("https://www.gasbuddy.com/usa/tx", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      timeout: 5000
    });

    const $ = cheerio.load(response.data);
    const priceText = $(".city-price").first().text().trim();

    if (priceText) {
      const numericPrice = priceText.replace(/[^0-9.]/g, "");
      if (numericPrice) {
        items.push({
          name: "Texas Retail Diesel/Gas Average",
          category: "Fuel",
          value: numericPrice,
          unit: "USD/gal",
          source: "Texas Spot Scraping"
        });
      }
    }
  } catch {
    // Silent catch for web scraping fallback
  }

  return items;
}

/**
 * 🚀 Master Oracle Harvester Engine
 */
export async function runOracleHarvest() {
  const results: OracleItem[] = [];

  const [eiaFuel, fredSteel, scrapedFuel] = await Promise.allSettled([
    fetchEiaDieselPrice(),
    fetchFredSteelIndex(),
    scrapeLiveFuelPrices()
  ]);

  if (eiaFuel.status === "fulfilled" && eiaFuel.value) results.push(eiaFuel.value);
  if (fredSteel.status === "fulfilled" && fredSteel.value) results.push(fredSteel.value);
  if (scrapedFuel.status === "fulfilled") results.push(...scrapedFuel.value);

  return results;
}