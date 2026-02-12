// server.js

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
    args: ['--no-sandbox', '--disable-setuid-sandbox',  '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.goto("https://www.nbc.gov.kh/english/economic_research/exchange_rate.php", {
    waitUntil: 'networkidle'
  });

  // Set the date in the date picker
  await page.evaluate((d) => {
    document.querySelector('#datepicker').value = d;
  }, date);

  // Click the View button
  await page.click('input[name="view"]');

  // Wait a second for the table to update (important for past dates)
  await page.waitForTimeout(1000);

  // Scrape table rows
  const rates = await page.$$eval('table tr', rows => {
    const result = [];
    rows.forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if (tds.length >= 6) {
        const codeCell = tds[1].innerText.trim();
        const avgCell = tds[5].innerText.trim();
        const code = (codeCell.split("/")[0] || "").toUpperCase();
        const avg = parseFloat(avgCell.replace(/[, ]/g, ""));
        if (code && !isNaN(avg)) result.push({ currency: code, avg });
      }
    });
    return result;
  });

  await browser.close();
  return rates;
}

    app.get("/nbcRate", async (req, res) => {
       try { const rawDate = req.query.date || new 
      Date().toISOString().slice(0, 10); 
      const dateParam = rawDate.padStart(10, "0"); 
      const rates = await getNbcRates(dateParam);
      
      res.json({ source: "live", date: dateParam, rates }); 
     } catch (err) { console.error("NBC converter error:", err);
       res.status(500).json({ error: err.message }); 
      } 
    }); 
    const PORT = process.env.PORT || 3000; 
    app.listen(PORT, () => { 
      console.log(`NBC converter API listening on port ${PORT}`); 
    });