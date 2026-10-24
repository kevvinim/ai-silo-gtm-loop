const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = process.argv[2] || require('path').join(__dirname, '..', 'site', 'public'); // run: (cd site && npm i && SITE_URL=https://ai-silo-check.vercel.app node build.js) && node tests/page-e2e.js
const srv = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, {'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'image/png'}); fs.createReadStream(f).pipe(res); }).listen(8123);
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://localhost:8123/t/b/?c=9&utm_source=share');
  console.log('banner:', await pg.textContent('#challenge'));
  await pg.click('#start');
  const picks = [0, 1, 2, 0, 2, 1]; // values: data-v order is 2,1,0 -> index
  for (const k of picks) await pg.locator('.opt').nth(k).click();
  console.log('type:', await pg.textContent('#type'), '| band:', await pg.textContent('#band'), '| score:', await pg.textContent('#score'));
  console.log('cmp:', await pg.textContent('#cmp'));
  console.log('x share:', decodeURIComponent(await pg.getAttribute('#sh-x', 'href')).slice(0, 200));
  
  console.log('errors:', errs.length ? errs : 'none');
  await b.close(); srv.close();
})();
