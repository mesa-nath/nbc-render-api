const puppeteer = require('puppeteer');

async function getNbcRates(date) {
  const url = "https://www.nbc.gov.kh/english/economic_research/exchange_rate.php";
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "networkidle2" });

  // Set the date in the date picker
  await page.evaluate((d) => {
    document.querySelector('#datepicker').value = d;
  }, date);

  // Click the View button
  await page.click('input[name="view"]');

  // Wait for the table to update (give it a second)
  await page.waitForTimeout(1000);

  // Scrape the table
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

// Example usage:
(async () => {
  const date = "2026-02-08";
  const rates = await getNbcRates(date);
  console.log(rates);
})();
