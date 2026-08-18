// Touch behaviour for the edge-action surfaces, driven with REAL browser gestures.
//
// This file exists because of a bug no other check could have caught. `touch-action`
// is touch-only, so a wrong value is completely invisible to wheel and mouse tests —
// the horizontal rows carried `pan-y`, which permits only VERTICAL panning, and on a
// real phone horizontal swipes inside a tile did nothing whatsoever while every
// desktop check stayed green.
//
// Method note: synthetic touch events dispatched from page script are untrusted and
// perform no scrolling, exactly like synthetic wheel events. These use CDP's
// `Input.synthesizeScrollGesture` with `gestureSourceType: 'touch'`, which is a real
// browser-level gesture and the only thing that exercises `touch-action` at all.
import { chromium } from 'playwright-core';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, p, d) => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`); };

const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` });
const ctx = await browser.newContext({
  viewport: { width: 412, height: 900 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

const state = () => page.evaluate(() => {
  const row = document.querySelector('.sides__row');
  const sc = row.querySelector(':scope > .sa__scroller');
  const card = document.querySelector('.sides__card > .sa__scroller');
  const strips = [...row.querySelectorAll(':scope > .sa__strip')];
  return {
    rowPos: Math.round(sc.scrollLeft),
    cardPos: Math.round(card.scrollTop),
    stripEnd: Math.round(strips[1].getBoundingClientRect().width),
    touchAction: getComputedStyle(sc).touchAction,
    cardTouchAction: getComputedStyle(card).touchAction,
    status: document.querySelector('.proto__status').textContent.replace('All sides · ', ''),
  };
});

const swipe = async (x, y, dx, dy) => {
  await cdp.send('Input.synthesizeScrollGesture', {
    x, y, xDistance: dx, yDistance: dy, gestureSourceType: 'touch', speed: 800,
  });
  await sleep(900);
};

const rowCentre = async () => {
  await page.evaluate(() => {
    const sc = document.querySelector('.sides__card > .sa__scroller');
    const r = document.querySelector('.sides__row');
    sc.scrollTop = Math.max(0, r.offsetTop - sc.clientHeight / 2 + r.offsetHeight / 2);
  });
  await sleep(500);
  return page.evaluate(() => {
    const r = document.querySelector('.sides__row').getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
};

const load = async () => {
  await page.goto('http://localhost:5173/prototype.html#/gesture/sides');
  await page.reload();
  await page.waitForSelector('.sides__row');
  await sleep(900);
};

await load();
{
  const c = await rowCentre();
  const before = await state();
  check('touch: surfaces permit panning on both axes',
    before.touchAction === 'manipulation' && before.cardTouchAction === 'manipulation',
    `row "${before.touchAction}", card "${before.cardTouchAction}" — pan-x/pan-y here blocks one axis outright`);

  // The reported bug: horizontal swipe inside a tile did nothing on a real phone.
  await swipe(c.x, c.y, -140, 0);
  const afterH = await state();
  check('touch: a horizontal swipe inside a tile reveals its actions',
    afterH.rowPos > before.rowPos && afterH.stripEnd > 0,
    `rowPos ${before.rowPos} → ${afterH.rowPos}, strip ${afterH.stripEnd}px`);

  // And the fix must not cost the list its own scroll — `pan-x` on the row would.
  const beforeV = await state();
  await swipe(c.x, c.y, 0, -160);
  const afterV = await state();
  check('touch: a vertical swipe over a tile still scrolls the list behind it',
    afterV.cardPos > beforeV.cardPos,
    `cardPos ${beforeV.cardPos} → ${afterV.cardPos}`);
}

// The scroll staircase itself has to hold under touch: one swipe reveals, and it
// must not also fire, however hard the swipe was thrown.
{
  await load();
  const c = await rowCentre();
  await swipe(c.x, c.y, -600, 0);
  const s = await state();
  check('touch: one swipe reveals but cannot also fire',
    s.status === 'nothing fired yet' && s.stripEnd > 0,
    `status "${s.status}", strip ${s.stripEnd}px`);

  await sleep(400);
  await swipe(c.x, c.y, -300, 0);
  const fired = await state();
  check('touch: a second swipe runs the edgemost action',
    fired.status.startsWith('Snooze'), `status "${fired.status}"`);
}

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
