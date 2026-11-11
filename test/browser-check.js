#!/usr/bin/env node
/*
 * Headless browser check. Opens index.html from disk with Playwright
 * (Chromium), fails on any console error or page error, and checks that each
 * sample tool renders its expected verdict and an affordability verdict that
 * matches the engine, that changing cost inputs never changes readiness, plus
 * an X-ray rejection. With --screenshots it writes docs/img/*.png.
 *
 *   npm run check:browser
 */
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const SAMPLES = require('../data/samples.json').samples;
const N = require('../src/engine.js');
const SHOTS = process.argv.includes('--screenshots');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const requests = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { if (!r.url().startsWith('file:')) requests.push(r.url()); });
  await page.goto(pathToFileURL(path.join(__dirname, '..', 'index.html')).href, { waitUntil: 'load' });

  const failures = [];
  for (const s of SAMPLES) {
    await page.click('#tool-' + s.id);
    const verdict = await page.getAttribute('#verdict-card', 'data-verdict');
    const label = await page.textContent('#verdict-label');
    const carbon = await page.textContent('#carbon-figure');
    const ok = verdict === s.expectedVerdict;
    console.log((ok ? 'PASS ' : 'FAIL ') + s.name + ': ' + verdict + ' (' + label + '); carbon ' + carbon.trim());
    if (!ok) failures.push(s.name + ' expected ' + s.expectedVerdict + ', got ' + verdict);
    const afford = await page.textContent('#afford-pill');
    const want = N.evaluate(s).affordability.verdict.replace('_', ' ');
    console.log((afford === want ? 'PASS ' : 'FAIL ') + s.name + ' affordability: ' + afford);
    if (afford !== want) failures.push(s.name + ' affordability ' + afford + ', engine says ' + want);
    const layers = await page.$$eval('#afford-layers .layer', (r) => r.length);
    if (layers !== 8) failures.push(s.name + ' shows ' + layers + ' cost layers, expected 8');
    if (SHOTS) {
      await page.screenshot({ path: path.join(__dirname, '..', 'docs', 'img', s.id + '.png'), fullPage: false });
      const card = await page.$('#afford-card');
      await card.screenshot({ path: path.join(__dirname, '..', 'docs', 'img', s.id + '-affordability.png') });
    }
  }
  // Separation: wild cost inputs must not move readiness.
  await page.click('#tool-' + SAMPLES[2].id);
  const before = await page.getAttribute('#verdict-card', 'data-verdict');
  await page.fill('#cost-costPerMissInr', '99999999');
  await page.fill('#cost-readMinutesManual', '0');
  await page.selectOption('#cost-state', 'mh');
  const after = await page.getAttribute('#verdict-card', 'data-verdict');
  const tariffShown = await page.textContent('#afford-card');
  console.log((before === after ? 'PASS ' : 'FAIL ') + 'readiness unchanged by cost inputs: ' + before + ' -> ' + after);
  if (before !== after) failures.push('cost inputs changed readiness');
  if (!/Maharashtra/.test(tariffShown)) failures.push('state tariff not shown after selecting Maharashtra');
  await page.click('#reset-btn');
  // X-ray rejection through the UI.
  await page.click('#tool-' + SAMPLES[0].id);
  await page.selectOption('#f-modality', 'XRAY');
  const xr = await page.getAttribute('#verdict-card', 'data-verdict');
  console.log((xr === 'REJECTED' ? 'PASS ' : 'FAIL ') + 'X-ray entry: ' + xr);
  if (xr !== 'REJECTED') failures.push('X-ray not rejected');
  // Notices visible.
  for (const id of ['#status-line', '#placeholder-notice']) {
    const vis = await page.isVisible(id);
    const txt = (await page.textContent(id)) || '';
    if (!vis || txt.length < 20) failures.push(id + ' not visible');
  }
  const certRows = await page.$$eval('#certainty-card tbody tr', (r) => r.length);
  if (certRows !== 6) failures.push('certainty table shows ' + certRows + ' rows');

  await browser.close();
  if (requests.length) failures.push('external requests: ' + requests.join(', '));
  if (errors.length) failures.push(...errors);
  if (failures.length) {
    console.error('\nBrowser check FAILED:\n- ' + failures.join('\n- '));
    process.exit(1);
  }
  console.log('\nBrowser check passed: no console errors, no external requests, all verdicts as expected.');
})().catch((e) => { console.error(e); process.exit(1); });
