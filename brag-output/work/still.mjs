import puppeteer from 'puppeteer-core';
const times = process.argv.slice(2).map(Number);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const p = await b.newPage(); await p.setViewport({ width: 1920, height: 1080 });
await p.goto('file://' + process.cwd() + '/video.html', { waitUntil: 'networkidle0' });
await p.evaluate(() => window.ready);
for (const t of times) { await p.evaluate((t) => render(t), t); await p.screenshot({ path: `stills/t${t}.jpg`, quality: 80, type: 'jpeg' }); }
await b.close();
