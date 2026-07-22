import axios from 'axios';
import * as cheerio from 'cheerio';

export interface ScrapedItem {
  item_name: string;
  category: string;
  stock_level: number;
  unit_price_usd: string;
}

/**
 * Scrapes real-time Gulf Coast wholesale spot prices from EIA
 */
export async function scrapeLiveFuelPrices(): Promise<ScrapedItem[]> {
  try {
    const url = 'https://www.eia.gov/todayinenergy/prices.php';
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Aurelius-Node-01-Agent; Fleet Intelligence Engine)'
      },
      timeout: 8000
    });

    const $ = cheerio.load(response.data);
    const items: ScrapedItem[] = [];

    $('table tr').each((_, row) => {
      const text = $(row).text();

      // Look for Gulf Coast Low-Sulfur Diesel
      if (text.includes('Low-Sulfur Diesel') || text.includes('Gulf Coast')) {
        const cells = $(row).find('td');
        if (cells.length >= 3) {
          const area = $(cells[0]).text().trim();
          const price = parseFloat($(cells[1]).text().trim());

          if (area.includes('Gulf Coast') && !isNaN(price)) {
            items.push({
              item_name: 'Ultra-Low Sulfur Diesel (Gulf Coast Bulk Spot)',
              category: 'Fuel',
              stock_level: 45000,
              unit_price_usd: price.toFixed(2)
            });
          }
        }
      }
    });

    return items;
  } catch (error: any) {
    console.error('❌ [SCRAPER ERROR]:', error.message);
    return [];
  }
}