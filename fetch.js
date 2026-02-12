console.log('*** server.js loading ***');
const express = require('express');
const { chromium } = require('playwright');

const app = express();

// Health check
app.get('/', (req, res) => {
  res.send('NBC converter API is running. Try /nbcRate?date=YYYY-MM-DD');
});

async function getNbcRates(date) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.goto('https://www.nbc.gov.kh/english/economic_research/exchange_rate.php', {
    waitUntil: 'domcontentloaded'
  });

  // --- 1) Set the date and trigger NBC's form logic properly ---
  // Use fill + dispatch 'change' because NBC binds to events.
  await page.fill('#datepicker', date);
  await page.dispatchEvent('#datepicker', 'change');

  // Click the View button to submit the form
  await page.click('input[name="view"]');

  // Wait for the content to update (the table and the official block)
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800); // small grace period

  // --- 2) Extract USD/KHR from the "Official Exchange Rate" block ---
  // It appears as: Official Exchange Rate : <font>4024</font> KHR / USD
 // --- 2) Extract USD/KHR from the "Official Exchange Rate" block ---
// We do not touch <font> tags anymore. We match the exact phrase and number.
const usdOfficial = await page.evaluate(() => {
  // Read only the form area where NBC renders the date + official rate
  const scope = document.querySelector('#fm-ex') || document.body;
  const text = (scope.innerText || '').replace(/\s+/g, ' ').trim();

  // Exact pattern: "Official Exchange Rate : 4024 KHR / USD"
  const m = text.match(/Official\s+Exchange\s+Rate\s*:\s*([\d,]+)\s*KHR\s*\/\s*USD/i);
  if (!m) return null;

  const n = parseFloat(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
});

// Sanity-check: should be in a realistic range; otherwise we likely matched the year.
if (!(usdOfficial && usdOfficial > 3000 && usdOfficial < 5000)) {
  throw new Error(`Could not parse a valid USD/KHR official rate (got ${usdOfficial}). The page layout may have changed.`);
}

  // --- 3) Scrape other currencies from the table ---
  const otherRates = await page.$$eval('table tr', rows => {
    const result = [];
    rows.forEach(tr => {
      const tds = tr.querySelectorAll('td');
      // Expect at least: Currency, Symbol, Unit, Bid, Ask, Average
      if (tds.length >= 6) {
        const codeCell = tds[1].innerText.trim(); // e.g., "AUD/KHR"
        const avgCell = tds[5].innerText.trim();  // e.g., "2872.50"
        const code = (codeCell.split('/')[0] || '').toUpperCase();
        const avg = parseFloat(avgCell.replace(/[, ]/g, ''));
        if (code && !Number.isNaN(avg)) {
          // Skip USD here to avoid duplicates (USD isn't in the table anyway)
          if (code !== 'USD') {
            result.push({ currency: code, avg });
          }
        }
      }
    });
    return result;
  });

  // --- 4) Merge USD into the final list (if found) ---
  const rates = [...otherRates];
  if (usdOfficial && Number.isFinite(usdOfficial)) {
    rates.unshift({ currency: 'USD', avg: usdOfficial });
  }

  await browser.close();
  return rates;
}

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`NBC converter API listening on port ${PORT}`);
});
