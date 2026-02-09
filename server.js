// server.js

console.log('*** server.js loading ***'); 
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();

// Health check
app.get('/', (req, res) => {
  res.send('NBC converter API is running. Try /nbcRate?date=YYYY-MM-DD');
});

app.get('/nbcRate', async (req, res) => {
  try {
    const dateParam = req.query.date || new Date().toISOString().substring(0, 10);

    // 1) Fetch NBC (English) exchange-rate page
    const url = 'https://www.nbc.gov.kh/english/economic_research/exchange_rate.php';
    const resp = await axios.get(url, { timeout: 15000 });
    const $ = cheerio.load(resp.data);

    // 2) Extract "Official Exchange Rate : #### KHR / USD" (optional)
    let official = null;
    const allText = $('body').text();
    const m = allText.match(/Official Exchange Rate\s*:\s*([\d,]+)\s*KHR\s*\/\s*USD/i);
    if (m) official = parseInt(m[1].replace(/,/g, ''), 10);

    // 3) Parse the table rows → use the "Average" column
    const rates = [];
    $('table tr').each((_, tr) => {
      const tds = $(tr).find('td');
      if (tds.length >= 6) {
        const codeCell = $(tds[1]).text().trim();  // e.g., "EUR/KHR"
        const avgCell  = $(tds[5]).text().trim();  // "Average"
        const code = (codeCell.split('/')[0] || '').toUpperCase();
        const avg  = parseFloat(avgCell.replace(/[, ]/g, ''));
        if (code && !Number.isNaN(avg)) {
          rates.push({ currency: code, avg });
        }
      }
    });

    res.set('Content-Type', 'application/json');
    res.status(200).json({
      date: dateParam,             // for BC "Starting Date" mapping
      official_usd_khr: official,  // optional
      rates
    });
  } catch (err) {
    console.error('NBC converter error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Render provides PORT in env; locally default to 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`NBC converter API listening on port ${PORT}`);
});