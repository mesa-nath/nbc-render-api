// *** server.js ***
console.log('*** server.js loading ***');
const { getBrowser } = require('./browser');
const express = require('express');

const { chromium } = require('playwright');

const app = express();

// Health check
app.get('/', (req, res) => {
  res.send('NBC converter API is running. Try /nbcRate?date=YYYY-MM-DD');
});

/**
 * Scrape NBC exchange rates for the given date (YYYY-MM-DD).
 * - USD/KHR is parsed from the "Official Exchange Rate : #### KHR / USD" line (outside the table).
 * - All other currencies are parsed from the main table rows.
 */
async function getNbcRates(date) {
   const browser = await getBrowser();

  const page = await browser.newPage();

  // 1) Navigate
  await page.goto('https://www.nbc.gov.kh/english/economic_research/exchange_rate.php', {
    waitUntil: 'domcontentloaded',
  });

  // 2) Set date and submit the form (fire change event so NBC updates server-side)
  await page.fill('#datepicker', date);
  await page.dispatchEvent('#datepicker', 'change');
  await page.click('input[name="view"]');

  // 3) Wait for content to settle
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);

  // 4) Extract USD/KHR from the "Official Exchange Rate" line ONLY
  const usdOfficial = await page.evaluate(() => {
    // Limit scope to the Exchange Rate form if present
    const scope = document.querySelector('#fm-ex') || document.body;
    const text = (scope.innerText || '').replace(/\s+/g, ' ').trim();

    // Exact English pattern on the NBC English page:
    // "Official Exchange Rate : 4024 KHR / USD"
    const m = text.match(/Official\s+Exchange\s+Rate\s*:\s*([\d,]+)\s*KHR\s*\/\s*USD/i);
    if (!m) return null;

    const n = parseFloat(m[1].replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  });

  // Sanity check to avoid parsing the year or garbage
  if (!(usdOfficial && usdOfficial > 3000 && usdOfficial < 5000)) {
    // If you want to be tolerant, you could skip throwing and just not include USD.
    throw new Error(
      `Could not parse a valid USD/KHR official rate (got ${usdOfficial}). The page layout may have changed.`
    );
  }

  // 5) Scrape other currencies from the table
  const otherRates = await page.$$eval('table tr', (rows) => {
    const result = [];
    rows.forEach((tr) => {
      const tds = tr.querySelectorAll('td');
      // Expect columns: Currency | Symbol | Unit | Bid | Ask | Average
      if (tds.length >= 6) {
        const codeCell = tds[1].innerText.trim(); // e.g., "AUD/KHR"
        const avgCell = tds[5].innerText.trim(); // e.g., "2872.50"
        const code = (codeCell.split('/')[0] || '').toUpperCase();
        const avg = parseFloat(avgCell.replace(/[, ]/g, ''));
        if (code && !Number.isNaN(avg) && code !== 'USD') {
          result.push({ currency: code, avg });
        }
      }
    });
    return result;
  });

  await browser.close();

  // 6) Return combined list with USD first
  return [{ currency: 'USD', avg: usdOfficial }, ...otherRates];
}

// API endpoint
app.get('/nbcRate', async (req, res) => {
  try {
    const rawDate = req.query.date || new Date().toISOString().slice(0, 10);
    const dateParam = rawDate.padStart(10, '0');

    const rates = await getNbcRates(dateParam);

    res.json({ source: 'live', date: dateParam, rates });
  } catch (err) {
    console.error('NBC converter error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`NBC converter API listening on port ${PORT}`);
});