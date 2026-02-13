const { chromium } = require('playwright');

function chromiumLaunchArgs() {
  return [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-zygote',
    '--single-process'
  ];
}

async function getBrowser() {
  return chromium.launch({
    headless: true,
    args: chromiumLaunchArgs()
  });
}

module.exports = { getBrowser };