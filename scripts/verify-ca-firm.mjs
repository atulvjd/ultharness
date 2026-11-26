import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, access, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, extname, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir, homedir } from 'node:os';
import { auditAccessibility } from '../ca-firm/check-accessibility.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../ca-firm');
const evidence = join(root, 'evidence');
const pages = ['index', 'about', 'services', 'contact', 'privacy'];
const serviceKeys = ['accounting', 'taxation', 'audit', 'advisory'];
const report = { startedAt: new Date().toISOString(), status: 'running', static: [], browser: [], consoleErrors: [], failedAssets: [], unexpectedRequests: [], limitations: ['Automated accessibility checks are focused checks, not a certification of WCAG conformance.'] };
let browser, zoomContext, profile, server, timedOut = false;
await mkdir(evidence, { recursive: true });
// A hard deadline also covers failed launches and hung server shutdowns.
const deadline = setTimeout(() => {
  timedOut = true;
  report.status = 'failed'; report.failure = 'Verification exceeded 110 seconds';
  void writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2)).finally(() => {
    server?.closeAllConnections(); server?.close();
    void browser?.close(); void zoomContext?.close();
    setTimeout(() => process.exit(1), 1000).unref();
  });
}, 110000);

try {
  const htmls = new Map();
  const titles = new Set(), descriptions = new Set();
  for (const file of ['styles.css', 'site.js', 'assets/mark.svg', 'assets/perspective.svg', 'assets/chevron.svg', 'README.md', 'check-accessibility.mjs']) await access(join(root, file));
  for (const page of pages) {
    const html = await readFile(join(root, `${page}.html`), 'utf8'); htmls.set(`${page}.html`, html);
    assert.match(html, /<html lang="en">/);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, `${page} h1 count`);
    assert.match(html, /class="skip-link" href="#main"/);
    assert.match(html, /CLIENT WEBSITE DRAFT/);
    assert.match(html, /No live enquiries/);
    assert.match(html, /form-action 'none'/);
    const title = html.match(/<title>(.*?)<\/title>/)?.[1];
    const description = html.match(/name="description" content="([^"]+)"/)?.[1];
    assert.ok(title && !titles.has(title), `${page} unique title`); titles.add(title);
    assert.ok(description && !descriptions.has(description), `${page} unique description`); descriptions.add(description);
    for (const destination of pages) assert.ok(html.includes(`href="${destination}.html"`), `${page} links to ${destination}`);
    assert.doesNotMatch(html, /(?:href|src)="(?:https?:|\/\/)|<iframe|<input[^>]+type="(?:file|password)"/i);
  }
  let links = 0;
  for (const [name, html] of htmls) {
    for (const [, value] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const url = new URL(value, `http://local/${name}`);
      assert.equal(url.origin, 'http://local', 'All resources must be local');
      const file = url.pathname.slice(1);
      const path = resolve(root, file);
      assert.ok(path.startsWith(root + sep)); await access(path);
      if (url.hash) {
        const target = await readFile(path, 'utf8');
        assert.ok(target.includes(`id="${url.hash.slice(1)}"`), `Missing fragment ${value}`);
      }
      if (url.search) assert.ok(serviceKeys.includes(url.searchParams.get('service')), `Unknown service query ${value}`);
      links++;
    }
  }
  const contact = htmls.get('contact.html');
  for (const key of serviceKeys) {
    assert.ok(contact.includes(`value="${key}"`));
    assert.ok(htmls.get('services.html').includes(`contact.html?service=${key}`));
    assert.ok(htmls.get('index.html').includes(`contact.html?service=${key}`));
  }
  for (const field of ['name', 'email', 'service', 'message']) {
    assert.ok(contact.includes(`for="${field}"`));
    assert.match(contact, new RegExp(`<[^>]+id="${field}"[^>]+required`));
    assert.ok(contact.includes(`id="${field}-error"`));
  }
  assert.match(contact, /role="status" aria-live="polite"/);
  assert.match(contact, /type="button" disabled>Check preview enquiry/);
  assert.match(contact, /Local preview · no delivery/);
  const js = await readFile(join(root, 'site.js'), 'utf8');
  assert.doesNotMatch(js, /\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage)\b|document\.cookie/);
  assert.match(js, /event\.preventDefault\(\)/);
  assert.match(js, /Nothing has been sent or saved/);
  assert.match(js, /validity\.typeMismatch/);
  assert.match(await readFile(join(root, 'styles.css'), 'utf8'), /prefers-reduced-motion/);
  report.static.push({ result: 'pass', pages: pages.length, localLinksAndAssets: links, assertions: 'Files, local paths, fragments, titles, descriptions, required labels, four service queries, no network/storage API, blocked form delivery, status region and reduced motion.' });
  console.log(`PASS: static assertions (${pages.length} pages, ${links} links/assets).`);

  const { chromium } = await import('playwright-core');
  const executablePath = process.env.CA_BROWSER_PATH || [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    join(homedir(), 'Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
  ].find(path => existsSync(path));
  assert.ok(executablePath, 'No browser executable found. Set CA_BROWSER_PATH to an installed Chromium browser.');
  browser = await chromium.launch({ headless: true, executablePath, timeout: 12000 });
  server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
      const content = await readFile(path);
      res.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'})[extname(path)] || 'application/octet-stream');
      res.end(content);
    } catch { res.writeHead(404).end('Not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const attachDiagnostics = page => {
    page.on('pageerror', error => report.consoleErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    page.on('requestfailed', request => report.failedAssets.push({url: request.url(), error: request.failure()?.errorText}));
    page.on('response', response => { if (response.status() >= 400) report.failedAssets.push({url: response.url(), status: response.status()}); });
    page.on('request', request => { if (!request.url().startsWith(origin + '/') || request.method() !== 'GET') report.unexpectedRequests.push({url: request.url(), method: request.method()}); });
  };
  const page = await context.newPage(); attachDiagnostics(page); page.setDefaultTimeout(3500);
  const audit = async (label, target = page) => {
    const result = await target.evaluate(auditAccessibility);
    assert.deepEqual(result.issues, [], `${label}: ${JSON.stringify(result.issues)}`);
    const overflow = await target.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, clipped: [...document.querySelectorAll('main p,main h1,main h2,main h3,main input,main select,main textarea,main button,header a')].filter(element => element.getClientRects().length).filter(element => { const r = element.getBoundingClientRect(); return r.left < -.5 || r.right > innerWidth + .5; }).map(element => element.textContent.slice(0, 60)) }));
    assert.ok(overflow.scroll <= overflow.width + 1, `${label} horizontal overflow: ${JSON.stringify(overflow)}`);
    assert.deepEqual(overflow.clipped, [], `${label} clipped elements`);
    report.browser.push({label, result: 'pass', textContrastSamples: result.textSamples, ...overflow});
  };
  for (const width of [1440, 390, 320, 768]) {
    await page.setViewportSize({ width, height: 960 });
    for (const name of pages) {
      await page.goto(`${origin}/${name}.html`);
      await audit(`${name} at ${width}px`);
      await page.screenshot({path: join(evidence, `${name}-${width}.png`), fullPage:true});
      await page.keyboard.press('Tab'); // Establish keyboard modality before testing :focus-visible.
      // Verify every visible interactive control can receive unobscured keyboard focus.
      for (const control of await page.locator('a,button:not(:disabled),input,select,textarea,summary').all()) {
        if (!await control.isVisible()) continue;
        await control.focus();
        assert.ok(await control.evaluate(element => {
          const r = element.getBoundingClientRect(), s = getComputedStyle(element);
          const point = document.elementFromPoint(Math.min(innerWidth - 2, Math.max(2, r.left + r.width / 2)), Math.min(innerHeight - 2, Math.max(2, r.top + r.height / 2)));
          return document.activeElement === element && s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2 && (element.contains(point) || point?.contains(element));
        }), `${name} ${width}: focus visibility/obscuration at ${await control.textContent()}`);
      }
    }
  }
  await page.setViewportSize({width:1440,height:960});
  for (const name of pages) {
    await page.goto(`${origin}/${name}.html`);
    for (const selector of ['header nav a', 'footer nav a']) {
      const destinations = await page.locator(selector).evaluateAll(elements => elements.map(element => element.getAttribute('href')));
      for (let i = 0; i < destinations.length; i++) {
        await page.goto(`${origin}/${name}.html`);
        await page.locator(selector).nth(i).click();
        assert.equal(new URL(page.url()).pathname, `/${destinations[i]}`);
        assert.equal(await page.locator('h1').count(), 1);
        report.browser.push({label:`${name}: ${selector} -> ${destinations[i]}`,result:'pass'});
      }
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto(`${origin}/index.html`);
  const toggle = page.locator('.menu-button');
  await toggle.focus(); await page.keyboard.press('Enter');
  assert.equal(await toggle.getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Tab');
  assert.ok(await page.locator('#site-nav a').first().evaluate(element => document.activeElement === element));
  await page.keyboard.press('Escape');
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  assert.ok(await toggle.evaluate(element => document.activeElement === element));
  assert.equal(await page.locator('#site-nav').isVisible(),false);
  await page.keyboard.press('Space');
  assert.equal(await toggle.getAttribute('aria-expanded'),'true');
  await toggle.click(); assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  await toggle.click(); await page.locator('#site-nav a[href="about.html"]').click();
  assert.equal(new URL(page.url()).pathname,'/about.html');
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  await toggle.click(); await page.locator('h1').click();
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  report.browser.push({label:'Mobile menu: Enter, Space, Tab, Escape, returned focus, pointer toggle, destination and outside click',result:'pass'});

  await page.setViewportSize({width:1440,height:960});
  for (const source of ['index', 'services']) for (const key of serviceKeys) {
    await page.goto(`${origin}/${source}.html`);
    await page.locator(`main a[href="contact.html?service=${key}"]`).click();
    assert.equal(await page.inputValue('#service'),key);
    assert.ok(await page.locator('#preview-notice').isVisible());
    report.browser.push({label:`${source} -> contact preselects ${key}`, result:'pass'});
  }
  await page.goto(`${origin}/contact.html?service=unknown`); assert.equal(await page.inputValue('#service'),'');
  await page.goto(`${origin}/services.html`);
  for (const summary of await page.locator('summary').all()) {
    await summary.focus(); await page.keyboard.press('Enter');
    assert.ok(await summary.evaluate(element => element.parentElement.open));
    await page.keyboard.press('Space'); assert.equal(await summary.evaluate(element => element.parentElement.open),false);
    await summary.click(); assert.ok(await summary.evaluate(element => element.parentElement.open));
  }
  report.browser.push({label:'FAQ keyboard and pointer disclosures',result:'pass'});
  await page.goto(`${origin}/contact.html`);
  const before = await page.evaluate(() => performance.getEntriesByType('resource').length);
  await page.click('#preview-button');
  assert.equal(await page.locator('[aria-invalid="true"]').count(),4);
  assert.ok(await page.locator('#name').evaluate(element => document.activeElement === element));
  assert.match(await page.locator('#form-status').innerText(),/correct 4 fields/);
  await audit('Contact required errors');
  await page.screenshot({path:join(evidence,'contact-invalid.png'),fullPage:true});
  await page.fill('#name','Preview Person'); await page.fill('#email','not-an-email');
  await page.selectOption('#service','accounting'); await page.fill('#message','Fictional enquiry about bookkeeping.');
  await page.click('#preview-button'); assert.equal(await page.getAttribute('#email','aria-invalid'),'true');
  assert.match(await page.locator('#email-error').innerText(),/email address/);
  await page.fill('#email','preview@example.com'); await page.click('#preview-button');
  assert.equal(await page.locator('[aria-invalid="true"]').count(),0);
  assert.match(await page.locator('#form-status').innerText(),/Nothing has been sent or saved.*No delivery destination/);
  assert.ok(await page.locator('#preview-notice').isVisible());
  await audit('Contact valid preview');
  await page.screenshot({path:join(evidence,'contact-valid-preview.png'),fullPage:true});
  assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').length),before,'Form check must not request any resource');
  assert.deepEqual(await page.evaluate(() => ({local:localStorage.length,session:sessionStorage.length,cookie:document.cookie})),{local:0,session:0,cookie:''});
  await page.fill('#name','   '); await page.click('#preview-button'); assert.equal(await page.getAttribute('#name','aria-invalid'),'true');
  await page.reload(); assert.ok(await page.locator('#preview-notice').isVisible());
  report.browser.push({label:'Required, whitespace, invalid email, valid preview, associated errors, live status, no requests/storage and persistent no-delivery notice',result:'pass'});
  await context.close();

  // A temporary Chrome profile uses actual browser default zoom, not CSS zoom.
  profile = await mkdtemp(join(tmpdir(),'ca-firm-zoom-'));
  await mkdir(join(profile,'Default'));
  await writeFile(join(profile,'Default','Preferences'),JSON.stringify({partition:{default_zoom_level:Math.log(2)/Math.log(1.2)}}));
  zoomContext = await chromium.launchPersistentContext(profile,{executablePath,headless:true,viewport:null,args:['--window-size=1440,1000'],timeout:12000});
  const zoom = await zoomContext.newPage(); attachDiagnostics(zoom); zoom.setDefaultTimeout(3500);
  for (const name of pages) {
    await zoom.goto(`${origin}/${name}.html`);
    const metrics = await zoom.evaluate(()=>({innerWidth,outerWidth,devicePixelRatio,scale:visualViewport.scale}));
    assert.ok(metrics.innerWidth <= 740 && metrics.innerWidth >= 680 && metrics.devicePixelRatio >= 1.9,`200% browser zoom was not applied: ${JSON.stringify(metrics)}`);
    await audit(`${name} at actual 200% browser zoom`,zoom);
    await zoom.screenshot({path:join(evidence,`${name}-zoom-200.png`),fullPage:true});
    report.browser.push({label:`${name} 200% zoom metrics`,...metrics,result:'pass'});
  }
  assert.deepEqual(report.consoleErrors,[],'Browser console errors');
  assert.deepEqual(report.failedAssets,[],'Failed assets');
  assert.deepEqual(report.unexpectedRequests,[],'External requests or non-GET requests');
  report.status = 'passed';
  console.log(`PASS: ${report.browser.length} browser checks, screenshots, focused accessibility audits, zero console/asset errors.`);
} catch (error) {
  report.status = 'failed'; report.failure = error.stack || String(error);
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  try {
    await zoomContext?.close(); await browser?.close();
    server?.closeAllConnections();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    if (profile) await rm(profile,{recursive:true,force:true});
    if (timedOut) { report.status = 'failed'; report.failure = 'Verification exceeded 110 seconds'; }
    report.finishedAt = new Date().toISOString();
    report.durationMs = new Date(report.finishedAt) - new Date(report.startedAt);
    await writeFile(join(evidence,'report.json'),JSON.stringify(report,null,2)+'\n');
  } finally { if (!timedOut) clearTimeout(deadline); }
}
