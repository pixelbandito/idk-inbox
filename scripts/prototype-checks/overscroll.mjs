// Verifies the two changes to the overscroll rig:
//   1. the affordance is invisible at rest and revealed only by the card's lift
//   2. the gesture survives the card sliding out from under the cursor, and a
//      wheel over the background/affordance area drives the same surface
//
// This has to run in a real browser: the bug is DOM hit-testing under a CSS
// transform, which jsdom has no layout engine to reproduce.

import { chromium } from 'playwright-core';

const URL = 'http://localhost:5173/prototype.html#/gesture/overscroll';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FRESH_GAP = 220; // > NEW_GESTURE_MS (150), < revertDelayMs (700)

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
});
const VH = Number(process.argv[2] ?? 800);
const page = await browser.newPage({ viewport: { width: 1280, height: VH } });
console.log(`viewport 1280x${VH}`);

const probe = () =>
  page.evaluate(() => {
    const card = document.querySelector('.pull__panel--scroll');
    const reveal = document.querySelector('.pull__reveal');
    const bg = document.querySelector('.pull__bg');
    const r = card.getBoundingClientRect();
    const bgr = bg?.getBoundingClientRect();
    return {
      phase: document.querySelector('.proto__status').textContent.split('· ')[1],
      revealH: Math.round(reveal.getBoundingClientRect().height),
      // How much of the affordance is actually on screen inside the clip window.
      bgVisibleH: bgr ? Math.round(Math.max(0, Math.min(bgr.bottom, reveal.getBoundingClientRect().bottom) - Math.max(bgr.top, reveal.getBoundingClientRect().top))) : 0,
      cardBottom: Math.round(r.bottom),
      scrollTop: Math.round(card.scrollTop),
      maxScroll: Math.round(card.scrollHeight - card.clientHeight),
    };
  });

// What the wheel would be delivered to at this point, and — the thing that
// actually matters — whether that target is inside the card at all.
const hitAt = (x, y) =>
  page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return { desc: 'none', inCard: false };
    const cls = (el.className || '').toString().split(' ')[0];
    return {
      desc: `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`,
      inCard: !!el.closest('.pull__panel--scroll'),
    };
  }, [x, y]);

await page.goto(URL);
await page.waitForSelector('.pull__panel--scroll');
await sleep(300);

// ---- 1. Nothing visible at rest -------------------------------------------
const rest = await probe();
check('affordance hidden at rest', rest.revealH === 0 && rest.bgVisibleH === 0,
  `reveal window ${rest.revealH}px, affordance visible ${rest.bgVisibleH}px, phase ${rest.phase}`);

// ---- 2. Cursor low in the card, the position that used to break ------------
// 30px above the card's bottom edge: the first pull lifts the card ~34px, which
// is enough to move it out from under this point.
const cursorX = 640;
const cursorY = rest.cardBottom - 30;
await page.mouse.move(cursorX, cursorY);
const hitBefore = await hitAt(cursorX, cursorY);

// Scroll to the bottom of the article with deliberate, "fresh" scrolls.
for (let i = 0; i < 30; i++) {
  const s = await probe();
  if (s.scrollTop >= s.maxScroll) break;
  await page.mouse.wheel(0, 300);
  await sleep(FRESH_GAP);
}
const atBottom = await probe();
check('precondition: the article is actually scrollable', atBottom.maxScroll > 0,
  `maxScroll ${atBottom.maxScroll}px`);
check('reached the bottom of the article', atBottom.maxScroll > 0 && atBottom.scrollTop >= atBottom.maxScroll,
  `scrollTop ${atBottom.scrollTop}/${atBottom.maxScroll}, phase ${atBottom.phase}`);

// Now the staircase: fresh scrolls at the bottom should grow the pull to armed.
const trace = [];
for (let i = 0; i < 8; i++) {
  await page.mouse.wheel(0, 40);
  await sleep(FRESH_GAP);
  const s = await probe();
  trace.push(`${s.phase}/${s.revealH}px`);
  if (s.phase === 'armed') break;
}
const armedState = await probe();
const hitAfter = await hitAt(cursorX, cursorY);

check('card leaves the cursor as it lifts (the root cause, reproduced)',
  hitBefore.inCard && !hitAfter.inCard,
  `under cursor: ${hitBefore.desc} (in card) → ${hitAfter.desc} (outside)`);
check('pull still reaches armed with the cursor off the card',
  armedState.phase === 'armed',
  `trace: ${trace.join(' → ')}`);
check('affordance revealed in step with the lift',
  armedState.revealH > 0 && armedState.bgVisibleH > 0,
  `reveal window ${armedState.revealH}px, affordance visible ${armedState.bgVisibleH}px`);

// ---- 3. Wheel over the background drives the same surface ------------------
await page.reload();
await page.waitForSelector('.pull__panel--scroll');
await sleep(400);
const fresh2 = await probe();
// A point that is background at rest AND stays outside the card for the whole
// gesture: the side margin. (Now that the card sits 1rem off the bottom, there is
// no longer a tall band underneath to aim at — the revealed strip only exists
// while the card is lifted, which is the case the fix is really about.)
const bandX = 8;
const bandY = Math.round(fresh2.cardBottom / 2);
await page.mouse.move(bandX, bandY);
const bandHit = await hitAt(bandX, bandY);
const beforeScroll = (await probe()).scrollTop;
await page.mouse.wheel(0, 300);
await sleep(FRESH_GAP);
const afterScroll = (await probe()).scrollTop;
check('wheel over the background scrolls the article',
  afterScroll > beforeScroll,
  `over ${bandHit.desc}: scrollTop ${beforeScroll} → ${afterScroll}`);

// And it can carry the gesture all the way from out there.
for (let i = 0; i < 30; i++) {
  const s = await probe();
  if (s.scrollTop >= s.maxScroll) break;
  await page.mouse.wheel(0, 300);
  await sleep(FRESH_GAP);
}
for (let i = 0; i < 8; i++) {
  await page.mouse.wheel(0, 40);
  await sleep(FRESH_GAP);
  if ((await probe()).phase === 'armed') break;
}
const fromBand = await probe();
check('gesture can be driven entirely from the background',
  fromBand.phase === 'armed',
  `phase ${fromBand.phase}, reveal ${fromBand.revealH}px`);

// ---- 3b. No waiting for the article's scroll to "settle" -------------------
// The reported symptom: after a big/fast scroll to the bottom, the pull refused
// to start until the scroll animation finished. One huge delta lands us at the
// bottom; the very next deliberate scroll must arm, with no dwell in between.
await page.reload();
await page.waitForSelector('.pull__panel--scroll');
await sleep(400);
const g = await probe();
await page.mouse.move(cursorX, g.cardBottom - 40);
await page.mouse.wheel(0, 5000); // overshoots the whole article in one go
await sleep(FRESH_GAP);
const landed = await probe();
await page.mouse.wheel(0, 40); // the first deliberate scroll after landing
await sleep(80);
const started = await probe();
check('no settle wait: the scroll right after landing starts the pull',
  landed.scrollTop >= landed.maxScroll && started.revealH > 0,
  `landed at ${landed.scrollTop}/${landed.maxScroll} then phase ${started.phase}, reveal ${started.revealH}px`);

// ---- 4. Confirm fires, and the affordance retracts ------------------------
// Carry that same pull through to armed, then confirm.
for (let i = 0; i < 8; i++) {
  await page.mouse.wheel(0, 40);
  await sleep(FRESH_GAP);
  if ((await probe()).phase === 'armed') break;
}
await page.mouse.wheel(0, 40);
await sleep(120);
const firedState = await probe();
check('a further fresh scroll confirms', firedState.phase === 'activated',
  `phase ${firedState.phase}`);

await page.screenshot({ path: 'overscroll-armed.png' });
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
