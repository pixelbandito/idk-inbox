// Rig 4 — scroll-to-act generalised onto any edge, with more than one action a side.
//
// What's worth checking here that the single-edge rig couldn't answer: the x axis
// (no rubber-band to lean on, much less travel), more than one action per side, and
// NESTING — horizontal rows inside a vertical card, which is the arrangement a
// thread list actually has. Nesting is where the bugs were: a descendant CSS
// selector sized the rows' pads on the wrong axis, and a scroll-position
// compensation meant for one side cancelled the browser's animation on the other.
import { chromium } from 'playwright-core';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, p, d) => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`); };

const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` });
const page = await browser.newPage({ viewport: { width: 900, height: Number(process.argv[2] ?? 700) } });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

/** State of one surface, by CSS selector. */
const probe = (sel) => page.evaluate((sel) => {
  const sa = document.querySelector(sel);
  const sc = sa.querySelector(':scope > .sa__scroller');
  const pads = [...sa.querySelectorAll(':scope > .sa__scroller > .sa__pad')];
  const strips = [...sa.querySelectorAll(':scope > .sa__strip')];
  const horiz = sa.classList.contains('sa--x');
  const size = (el) => Math.round(horiz ? el.getBoundingClientRect().width : el.getBoundingClientRect().height);
  const padSize = (el) => (horiz ? el.offsetWidth : el.offsetHeight);
  const sheet = sa.querySelector(':scope > .sa__scroller > .sa__sheet').getBoundingClientRect();
  // Which action labels are actually inside their strip's visible window.
  const visible = strips.flatMap((strip) => {
    const sr = strip.getBoundingClientRect();
    if (sr.width < 2 || sr.height < 2) return [];
    return [...strip.querySelectorAll('.sa__action')]
      .filter((a) => {
        const r = a.getBoundingClientRect();
        const w = Math.min(r.right, sr.right) - Math.max(r.left, sr.left);
        const h = Math.min(r.bottom, sr.bottom) - Math.max(r.top, sr.top);
        return w > 2 && h > 2;
      })
      .map((a) => a.textContent.trim());
  });
  return {
    pos: Math.round(horiz ? sc.scrollLeft : sc.scrollTop),
    max: Math.round(horiz ? sc.scrollWidth - sc.clientWidth : sc.scrollHeight - sc.clientHeight),
    padStart: padSize(pads[0]), padEnd: padSize(pads[1]),
    stripStart: size(strips[0]), stripEnd: size(strips[1]),
    sheetStart: Math.round(horiz ? sheet.left : sheet.top),
    visible,
    status: document.querySelector('.proto__status').textContent.replace('All sides · ', ''),
  };
}, sel);

const centre = (sel) => page.evaluate((sel) => {
  const r = document.querySelector(sel).getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
}, sel);

/**
 * Put a row on screen and return its centre. The card scrolls, so a row can sit
 * outside the visible band entirely — and then every mouse.wheel aimed at "its
 * centre" lands somewhere else and the section silently tests nothing.
 *
 * Scrolled with scrollTop directly rather than a wheel: a wheel would travel the
 * card's own staircase on the way past, which is not what these sections are about.
 */
const rowInView = async (sel = ROW) => {
  await page.evaluate((sel) => {
    const sc = document.querySelector('.sides__card > .sa__scroller');
    const row = document.querySelector(sel);
    const target = row.offsetTop - sc.clientHeight / 2 + row.offsetHeight / 2;
    sc.scrollTop = Math.max(0, target);
  }, sel);
  await sleep(400);
  return centre(sel);
};

/**
 * Wait for the surface to stop moving AND for its pads to stop changing.
 *
 * Three consecutive identical samples, not two. Pad changes deliberately lag the
 * last movement (the hook waits to be sure the compositor has finished before it
 * touches layout), so a two-sample settle returns during that window and every
 * assertion after it reads a state that is still one step from final.
 */
const settle = async (sel) => {
  let prev = '';
  let same = 0;
  for (let i = 0; i < 30; i++) {
    const s = await probe(sel);
    const key = `${s.pos}/${s.padStart}/${s.padEnd}`;
    same = key === prev ? same + 1 : 0;
    if (same >= 2) return s;
    prev = key;
    await sleep(100);
  }
  return probe(sel);
};

const load = async () => {
  // `goto()` to the same hash URL is a SAME-DOCUMENT navigation and does not reload,
  // so the fired-action log would leak between sections and every status assertion
  // after the first would read a stale value.
  await page.goto('http://localhost:5173/prototype.html#/gesture/sides');
  await page.reload();
  await page.waitForSelector('.sides__row');
  await sleep(700);
};

const ROW = '.sides__row';
const CARD = '.sides__card';

// --- 1. A surface at rest has already prepared its first pads ---------------
// Being at an edge is what earns a pad, and a fresh surface is at both edges of its
// axis at once. Preparing them must move nothing: that is the entire reason a pad
// can be readied in advance rather than on the scroll that uses it.
await load();
{
  await rowInView();
  const before = await page.evaluate(() =>
    Math.round(document.querySelector('.sides__row > .sa__scroller > .sa__sheet').getBoundingClientRect().left));
  const s = await settle(ROW);
  check('a row at rest has both pads prepared', s.padStart > 0 && s.padEnd > 0,
    `padStart ${s.padStart}px, padEnd ${s.padEnd}px`);
  check('and nothing is revealed by it', s.stripStart === 0 && s.stripEnd === 0 && s.visible.length === 0,
    `strips ${s.stripStart}/${s.stripEnd}px, visible [${s.visible}]`);
  check('preparing a leading pad does not shove the content',
    Math.abs(s.sheetStart - before) <= 1,
    `sheet left ${before} → ${s.sheetStart} (the pad grew ${s.padStart}px in front of it)`);
}

// --- 2. One travel reveals EVERY action on that side ------------------------
{
  const c = await rowInView();
  await page.mouse.move(c.x, c.y);
  await sleep(200);
  await page.mouse.wheel(220, 0);
  const s = await settle(ROW);
  check('one travel reveals every action on the side',
    s.visible.includes('Snooze') && s.visible.includes('Delete'),
    `visible [${s.visible.join(', ')}]`);
  check('the reveal stops at the reveal distance — it does not commit',
    s.status === 'nothing fired yet', `status "${s.status}"`);
  check('and settling then prepares the commit pad', s.padEnd > 192,
    `padEnd ${s.padEnd}px (reveal is 192px)`);
}

// --- 3. A second travel fires the EDGEMOST action ---------------------------
// Not the nearest, not a menu choice: the one hard against the container edge, which
// is also the first one uncovered. What you are offered and what happens are the same.
{
  await sleep(400);
  await page.mouse.wheel(220, 0);
  await sleep(500);
  const s = await probe(ROW);
  check('a second travel fires the edgemost action, not the inner one',
    s.status.startsWith('Snooze'), `status "${s.status}" (Delete sits inboard of Snooze)`);
}

// --- 4. The opposite side of the same axis, with a single action ------------
{
  await load();
  const c = await rowInView();
  await page.mouse.move(c.x, c.y);
  await sleep(300);
  await settle(ROW);
  await page.mouse.wheel(-220, 0);   // travel the leading pad
  const revealed = await settle(ROW);
  check('the leading side reveals its action', revealed.visible.includes('Archive'),
    `visible [${revealed.visible.join(', ')}], strip ${revealed.stripStart}px`);
  await sleep(400);
  await page.mouse.wheel(-220, 0);
  await sleep(500);
  const fired = await probe(ROW);
  check('and a second travel fires it', fired.status.startsWith('Archive'),
    `status "${fired.status}"`);
}

// --- 5. Nesting: the axes do not fight -------------------------------------
// A row only claims the axis it can move on, so a vertical scroll over a row must
// scroll the CARD. If this ever fails, a thread list becomes unscrollable wherever
// a row happens to be under the cursor.
{
  await load();
  const c = await rowInView();
  await page.mouse.move(c.x, c.y);
  await sleep(300);
  const cardBefore = await probe(CARD);
  const rowBefore = await probe(ROW);
  await page.mouse.wheel(0, 120);
  await sleep(400);
  const cardAfter = await probe(CARD);
  const rowAfter = await probe(ROW);
  check('a vertical scroll over a row scrolls the card, not the row',
    cardAfter.pos > cardBefore.pos && rowAfter.pos === rowBefore.pos,
    `card ${cardBefore.pos} → ${cardAfter.pos}, row ${rowBefore.pos} → ${rowAfter.pos}`);
}

// --- 6. One gesture can reveal, but can never also fire ---------------------
// The commit pad does not exist while input is still arriving, so however hard you
// throw a single gesture it runs out of room at the reveal. This is the property
// that makes the offer unskippable, and it is layout doing it, not a refusal.
{
  await load();
  const c = await rowInView();
  await page.mouse.move(c.x, c.y);
  await settle(ROW);
  await page.mouse.wheel(900, 0); // far more than reveal + commit combined
  const s = await settle(ROW);
  check('one gesture cannot reveal and fire, however hard it is thrown',
    s.status === 'nothing fired yet' && s.visible.includes('Snooze'),
    `status "${s.status}", visible [${s.visible.join(', ')}], strip ${s.stripEnd}px`);
}

// --- 7. The vertical card still works, through the same code ----------------
{
  await load();
  const c = await centre(CARD);
  await page.mouse.move(c.x, c.y);
  await settle(CARD);
  for (let i = 0; i < 25; i++) {
    const s = await settle(CARD);
    if (s.stripEnd > 0) break;
    await page.mouse.wheel(0, 200);
  }
  const revealed = await settle(CARD);
  check('the vertical card reveals its trailing action', revealed.visible.includes('Archive'),
    `visible [${revealed.visible.join(', ')}], strip ${revealed.stripEnd}px`);
  await sleep(400);
  await page.mouse.wheel(0, 200);
  await sleep(600);
  const fired = await probe(CARD);
  check('and travelling on fires it', fired.status.startsWith('Archive'),
    `status "${fired.status}"`);
}

// --- 8. Tapping a revealed action runs THAT action --------------------------
// Travel is the fast path and always means the edgemost action. Tapping is how the
// others stay reachable — which is what lets a side carry more than one without the
// full-travel gesture becoming ambiguous.
{
  await load();
  const c = await rowInView();
  await page.mouse.move(c.x, c.y);
  await settle(ROW);
  await page.mouse.wheel(220, 0);       // reveal both trailing actions
  await settle(ROW);

  const box = await page.evaluate(() => {
    const el = document.querySelector('.sides__row [data-action-id="delete"]');
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  await page.mouse.click(box.x, box.y);
  await sleep(300);
  const s = await probe(ROW);
  check('tapping the inner action runs that one, not the edgemost',
    s.status.startsWith('Delete'),
    `status "${s.status}" (a completed travel here would have fired Snooze)`);
}

// --- 9. A tap on the content is not a tap on an action ----------------------
// The sheet is opaque and is what covers the strips at rest, so a click inside its
// box is content. Without that test the hit-test would happily find an action
// sitting behind the message text.
{
  await load();
  const c = await rowInView();
  await page.mouse.move(c.x, c.y);
  await settle(ROW);
  await page.mouse.wheel(220, 0);
  await settle(ROW);
  const box = await page.evaluate(() => {
    const r = document.querySelector('.sides__row > .sa__scroller > .sa__sheet').getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  await page.mouse.click(box.x, box.y);
  await sleep(300);
  check('clicking the message itself fires nothing',
    (await probe(ROW)).status === 'nothing fired yet',
    `status "${(await probe(ROW)).status}"`);
}

// --- 10. The actions are reachable from the keyboard ------------------------
// They are real buttons; the surface's hit-test exists only because a MOUSE click
// cannot reach them through the scroller. Enter must work without any of that.
{
  await load();
  const c = await rowInView();
  await page.mouse.move(c.x, c.y);
  await settle(ROW);
  await page.mouse.wheel(220, 0);
  await settle(ROW);
  await page.evaluate(() => document.querySelector('.sides__row [data-action-id="delete"]').focus());
  const focused = await page.evaluate(() => document.activeElement?.dataset?.actionId ?? null);
  await page.keyboard.press('Enter');
  await sleep(300);
  const s = await probe(ROW);
  check('a revealed action is focusable and fires on Enter',
    focused === 'delete' && s.status.startsWith('Delete'),
    `focused "${focused}", status "${s.status}"`);
}

// --- 11. The far edge is still a stop after you have been to the near one ----
// Regression: a fresh surface rests at its start, so the start pad is prepared at
// mount. If pads never shrink, that room is still sitting there when you fling back
// across the content — and the far affordance opens on arrival with no stop, no
// offer, straight into the panel. Every side you are not resting against has to give
// its room back.
{
  await load();
  const c = await centre(CARD);
  await page.mouse.move(c.x, c.y);
  await settle(CARD);
  const atTop = await probe(CARD);
  check('a fresh card has prepared its leading pad', atTop.padStart > 0,
    `padStart ${atTop.padStart}px`);

  // Travel to the far end of the content and come to rest there.
  await page.evaluate(() => {
    const sc = document.querySelector('.sides__card > .sa__scroller');
    sc.scrollTop = sc.scrollHeight;
  });
  const atBottom = await settle(CARD);
  check('resting at the far edge gives the near pad back', atBottom.padStart === 0,
    `padStart ${atTop.padStart} → ${atBottom.padStart}px, padEnd ${atBottom.padEnd}px`);

  // Now fling back. With no leading pad there is nowhere to go past the content top,
  // so the top affordance cannot open on arrival.
  await page.mouse.wheel(0, -4000);
  await sleep(200);
  const midFling = await probe(CARD);
  check('flinging back across the card does not open the far affordance',
    midFling.stripStart === 0,
    `leading strip ${midFling.stripStart}px, padStart ${midFling.padStart}px, pos ${midFling.pos}`);

  const landed = await settle(CARD);
  check('and it is prepared again only once you come to rest there',
    landed.padStart > 0 && landed.stripStart === 0,
    `padStart ${landed.padStart}px, strip ${landed.stripStart}px`);
}

// --- 12. A tapped action shows the activated state --------------------------
// The lit treatment is driven by commit travel, and a tap has none — so without
// following the FIRED action specifically, tapping ran the action with no visible
// acknowledgement at all, and tapping an inner one would have lit the edgemost.
{
  await load();
  const c = await rowInView();
  await page.mouse.move(c.x, c.y);
  await settle(ROW);
  await page.mouse.wheel(220, 0);
  await settle(ROW);

  const lit = () => page.evaluate(() =>
    [...document.querySelectorAll('.sides__row .sa__action')].map((el) => ({
      id: el.dataset.actionId,
      commit: Number(getComputedStyle(el).getPropertyValue('--commit')) || 0,
      fired: el.dataset.fired === 'true',
    })));

  const before = await lit();
  const box = await page.evaluate(() => {
    const r = document.querySelector('.sides__row [data-action-id="delete"]').getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  await page.mouse.click(box.x, box.y);
  await sleep(200);
  const after = await lit();
  const del = after.find((a) => a.id === 'delete');
  const snooze = after.find((a) => a.id === 'snooze');
  check('a tapped action lights up', del?.commit === 1 && del?.fired === true,
    `delete --commit ${before.find((a) => a.id === 'delete')?.commit} → ${del?.commit}, fired ${del?.fired}`);
  check('and the edgemost one does not light up instead', snooze?.commit === 0,
    `snooze --commit ${snooze?.commit} (a travel here would have fired snooze)`);
}

// --- 13. No bare band opens up between the sheet and the actions ------------
// The strip is a window sized to the travel, and during the COMMIT that exceeds the
// reveal — so actions fixed at `revealPx` leave a transparent gap on the inboard
// side, exactly `commitPx` wide. On screen it reads as the tile having overshot and
// stuck. The actions must fill the strip at every point of the travel.
{
  await load();
  const c = await rowInView();
  await page.mouse.move(c.x, c.y);
  await settle(ROW);

  const band = () => page.evaluate(() => {
    const strip = document.querySelectorAll('.sides__row > .sa__strip')[1];
    const actions = strip.querySelector('.sa__actions');
    const sr = strip.getBoundingClientRect();
    const ar = actions.getBoundingClientRect();
    return {
      strip: Math.round(sr.width),
      actions: Math.round(ar.width),
      // Bare strip on the inboard (left) side of a trailing strip.
      gap: Math.round(ar.left - sr.left),
    };
  });

  await page.mouse.wheel(300, 0);          // travel the reveal
  await settle(ROW);
  const revealed = await band();
  check('no bare band once the actions are revealed', revealed.gap <= 1,
    `strip ${revealed.strip}px, actions ${revealed.actions}px, band ${revealed.gap}px`);

  // Part-way into the commit is where it used to open up.
  await sleep(300);
  await page.mouse.wheel(30, 0);
  await sleep(400);
  const midCommit = await band();
  check('nor part-way through the commit travel', midCommit.gap <= 1,
    `strip ${midCommit.strip}px, actions ${midCommit.actions}px, band ${midCommit.gap}px`);
  check('and the edgemost action is what grew',
    midCommit.actions > revealed.actions,
    `actions ${revealed.actions} → ${midCommit.actions}px (the extra goes to the one about to fire)`);
}

// --- 14. Drag selects by distance; scroll always means the edgemost -----------
// The two paths deliberately disagree. A scroll has no release, so it needs one
// fixed meaning. A drag has one, so distance can choose: one action-width in picks
// the edgemost, two picks the next inward, and letting go runs whichever you are on.
{
  await load();
  const c = await rowInView();

  /** Drag along the row by `dx` and hold, reporting what is selected. */
  const dragTo = async (dx, hold = true) => {
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(c.x - Math.round((dx * i) / steps), c.y);
      await sleep(16);
    }
    await sleep(120);
    const sel = await page.evaluate(() =>
      document.querySelector('.sides__row .sa__action[data-selected]')?.dataset.actionId ?? null);
    if (!hold) await page.mouse.up();
    return sel;
  };

  const nearSel = await dragTo(130, false);   // ~1.4 action widths
  await sleep(500);
  const nearFired = (await probe(ROW)).status;
  check('a drag one action-width in selects the edgemost, and running it fires that',
    nearSel === 'snooze' && nearFired.startsWith('Snooze'),
    `selected "${nearSel}", fired "${nearFired}"`);

  await load();
  const c2 = await rowInView();
  c.x = c2.x; c.y = c2.y;
  const farSel = await dragTo(230, false);    // past two action widths
  await sleep(500);
  const farFired = (await probe(ROW)).status;
  check('dragging further selects the next action inward, and runs THAT',
    farSel === 'delete' && farFired.startsWith('Delete'),
    `selected "${farSel}", fired "${farFired}" (a scroll this far would have fired Snooze)`);
}

// --- 15. A short drag commits to nothing --------------------------------------
{
  await load();
  const c = await rowInView();
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  for (let i = 0; i < 6; i++) { await page.mouse.move(c.x - 8 * (i + 1), c.y); await sleep(16); }
  await page.mouse.up();
  await sleep(700);
  check('releasing short of the first action runs nothing',
    (await probe(ROW)).status === 'nothing fired yet',
    `status "${(await probe(ROW)).status}"`);
}

// --- 16. Axis arbitration: a nested row must not steal the card's drag ---------
// Both surfaces see the same pointer, so the one whose axis the gesture is on has to
// claim it and the other has to let go. Without it, dragging down over a row moves
// the row and the card at once.
{
  await load();
  const c = await rowInView();
  const cardBefore = await probe(CARD);
  const rowBefore = await probe(ROW);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(c.x, c.y - i * 12); await sleep(16); }
  await page.mouse.up();
  await sleep(500);
  const cardAfter = await probe(CARD);
  const rowAfter = await probe(ROW);
  check('a vertical drag over a row moves the card, not the row',
    cardAfter.pos !== cardBefore.pos && rowAfter.pos === rowBefore.pos,
    `card ${cardBefore.pos} → ${cardAfter.pos}, row ${rowBefore.pos} → ${rowAfter.pos}`);
}

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
