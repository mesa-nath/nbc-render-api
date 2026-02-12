process.env.PUPPETEER_CACHE_DIR = '/opt/render/.cache/puppeteer';

console.log('*** server.js loading ***');

const express = require('express');
const puppeteer = require('puppeteer');

const app = express();

// Health check
app.get('/', (req, res) => {
  res.send('NBC converter API is running. Try /nbcRate?date=YYYY-MM-DD');
});

async function getNbcRates(date) {
  const url = "https://www.nbc.gov.kh/english/economic_research/exchange_rate.php";

  const browser = await puppeteer.launch({ 
    headless: true,
    executablePath: puppeteer.executablePath(), // ✅ correct path
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ],
  });

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });

  // Set date
  await page.evaluate((d) => {
    document.querySelector('#datepicker').value = d;
  }, date);

  // Click view
  await page.click('input[name="view"]');

  // Wait table load
  await page.waitForSelector('table tr');

  const rates = await page.evaluate(() => {
    const rows = document.querySelectorAll('table tr');
    const result = [];

    rows.forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if (tds.length >= 6) {
        const codeCell = tds[1].innerText.trim();
        const avgCell = tds[5].innerText.trim();
        const code = (codeCell.split("/")[0] || "").toUpperCase();
        const avg = parseFloat(avgCell.replace(/[, ]/g, ""));
        if (code && !isNaN(avg)) {
          result.push({ currency: code, avg });
        }
      }
    });

    return result;
  });

  await browser.close();
  return rates;
}

// API
app.get("/nbcRate", async (req, res) => {
  try {
    const rawDate = req.query.date || new Date().toISOString().slice(0, 10);
    const dateParam = rawDate.padStart(10, "0");

    const rates = await getNbcRates(dateParam);

    res.json({
      source: "live",
      date: dateParam,
      rates
    });
  } catch (err) {
    console.error("NBC converter error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`NBC converter API listening on port ${PORT}`);
});
