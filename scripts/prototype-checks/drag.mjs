// Verifies the peek reveal on the DRAG rig, whose card eases home on a CSS
// transition after release — so the reveal window has to ease with it or the
// affordance detaches from the card's edge mid-spring.

import { chromium } from 'playwright-core';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const probe = () =>
  page.evaluate(() => {
    const card = document.querySelector('.pull__panel--dragscroll');
    const reveal = document.querySelector('.pull__reveal');
    const bg = document.querySelector('.pull__bg');
    const rr = reveal.getBoundingClientRect();
    const br = bg.getBoundingClientRect();
    const m = new DOMMatrixReadOnly(getComputedStyle(card).transform);
    return {
      phase: document.querySelector('.proto__status').textContent.split('· ')[1],
      revealH: Math.round(rr.height),
      // Visible slice of the affordance inside the clip window.
      bgVisibleH: Math.round(Math.max(0, Math.min(br.bottom, rr.bottom) - Math.max(br.top, rr.top))),
      cardLift: Math.round(-m.m42),
      cardBottom: Math.round(card.getBoundingClientRect().bottom),
      gapBelowCard: Math.round(document.querySelector('.pull').getBoundingClientRect().bottom - card.getBoundingClientRect().bottom),
      maxScroll: Math.round(card.scrollHeight - card.clientHeight),
    };
  });

await page.goto('http://localhost:5173/prototype.html#/gesture/drag');
await page.waitForSelector('.pull__panel--dragscroll');
await sleep(400);

const rest = await probe();
check('affordance hidden at rest', rest.revealH === 0 && rest.bgVisibleH === 0,
  `reveal ${rest.revealH}px, affordance visible ${rest.bgVisibleH}px`);
check('card gap closed at rest', rest.gapBelowCard <= 20,
  `${rest.gapBelowCard}px below the card (was ~80px)`);

// Drag up: scroll the article to the bottom, then keep pulling past it. The
// travel needed is maxScroll + threshold, so start low and step in small
// increments that stay inside the viewport (a drag off the top gets dropped).
const x = 450;
const startYPos = rest.cardBottom - 20;
console.log(`  [drag] card bottom ${rest.cardBottom}, maxScroll ${rest.maxScroll}, start y ${startYPos}`);
await page.mouse.move(x, startYPos);
await page.mouse.down();
let y = startYPos;
const step = 20;
const floor = 30;
// Enough travel to consume the scroll and reach a visible pull, but stop short
// of the threshold so the next loop is what arms it.
while (y - step > floor) {
  y -= step;
  await page.mouse.move(x, y);
  await sleep(20);
  const s = await probe();
  if (s.revealH > 20) break;
}
const pulling = await probe();
console.log(`  [drag] after travel to y=${y}: phase ${pulling.phase}, lift ${pulling.cardLift}`);
// The window runs 2px taller than the lift on purpose (SEAM_BLEED), tucked
// behind the card so no hairline of page background shows at the seam.
check('reveal tracks the card while dragging',
  pulling.revealH > 0 && Math.abs(pulling.revealH - pulling.cardLift - 2) <= 1,
  `reveal ${pulling.revealH}px vs card lift ${pulling.cardLift}px (+2 seam bleed), phase ${pulling.phase}`);

// Pull past the threshold to arm.
for (let i = 0; i < 6; i++) {
  y -= 40;
  await page.mouse.move(x, y);
  await sleep(30);
}
const armed = await probe();
check('arms, with the affordance revealed', armed.phase === 'armed' && armed.bgVisibleH > 0,
  `phase ${armed.phase}, reveal ${armed.revealH}px, affordance visible ${armed.bgVisibleH}px`);

// Release: the card eases home over 260ms. The reveal must ease WITH it — if it
// snapped to 0 the affordance would vanish while the card was still travelling.
await page.mouse.up();
await sleep(60);
const midSpring = await probe();
check('reveal eases home with the card, not ahead of it',
  midSpring.revealH > 0 && Math.abs(midSpring.revealH - midSpring.cardLift) <= 12,
  `mid-spring: reveal ${midSpring.revealH}px vs card lift ${midSpring.cardLift}px`);
check('fired on release', midSpring.phase === 'activated', `phase ${midSpring.phase}`);

await sleep(500);
const settled = await probe();
check('settles fully closed', settled.revealH === 0 && settled.cardLift === 0,
  `reveal ${settled.revealH}px, card lift ${settled.cardLift}px`);

await page.screenshot({ path: 'shot-5-drag-armed.png' });
// One more armed frame to look at, held open.
await page.mouse.move(x, settled.cardBottom - 60);
await page.mouse.down();
y = settled.cardBottom - 60;
for (let i = 0; i < 18; i++) { y -= 40; await page.mouse.move(x, y); await sleep(25); }
await page.screenshot({ path: 'shot-5-drag-armed.png' });
await page.mouse.up();
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
