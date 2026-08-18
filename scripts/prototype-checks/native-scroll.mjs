// Native-scroll rig. Each scenario starts from a reload so nothing cascades, and
// gesture semantics are asserted with momentum-flagged events rather than with
// mouse.wheel timing (CDP round-trips are slower than the idle gap, so a
// "continuous" synthetic flick would read as several separate gestures).
import { chromium } from 'playwright-core';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, p, d) => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`); };

const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` });
const page = await browser.newPage({ viewport: { width: 1280, height: Number(process.argv[2] ?? 800) } });

const probe = () => page.evaluate(() => {
  const sc = document.querySelector('.pull__panel--nativescroll');
  const sheet = document.querySelector('.pull__sheet');
  const behind = document.querySelector('.pull__behind');
  const spacer = document.querySelector('.pull__spacer');
  const scr = sc.getBoundingClientRect(), br = behind.getBoundingClientRect(), sh = sheet.getBoundingClientRect();
  return {
    phase: document.querySelector('.proto__status').textContent.split('· ')[1],
    label: document.querySelector('.pull__label').textContent,
    footerH: spacer.offsetHeight,
    revealedPx: Math.round(Math.max(0, Math.min(scr.bottom, br.bottom) - Math.max(sh.bottom, br.top))),
    scrollTop: Math.round(sc.scrollTop),
    maxScroll: Math.round(sc.scrollHeight - sc.clientHeight),
    cardBottom: Math.round(scr.bottom),
    transform: getComputedStyle(sc).transform,
    snapType: getComputedStyle(sc).scrollSnapType,
    sheetSnap: getComputedStyle(sheet).scrollSnapAlign,
    // The tuner-bar readouts, joined. `stage N · reveal a/b · commit c/d` is the
    // only view of the two travels as separate quantities.
    readout: [...document.querySelectorAll('.tuner__readout')].map((r) => r.textContent).join(' | '),
    bg: getComputedStyle(document.querySelector('.pull__bg')).backgroundColor,
  };
});

const setRange = (labelText, v) => page.evaluate(([labelText, v]) => {
  const label = [...document.querySelectorAll('.tuner')].find((l) => l.textContent.includes(labelText));
  const input = label.querySelector('input[type=range]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(v));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return label.querySelector('.tuner__value').textContent;
}, [labelText, v]);

/** A wheel event with an explicit momentum flag, as the platform delivers one. */
const wheel = (deltaY, momentum) => page.evaluate(([deltaY, momentum]) => {
  document.querySelector('.pull__panel--nativescroll')
    .dispatchEvent(new WheelEvent('wheel', { deltaY, momentum, bubbles: true, cancelable: true }));
}, [deltaY, momentum]);

/** A deliberate, unambiguously-new gesture: real scroll after a clear pause. */
const deliberate = async (dy) => { await sleep(260); await page.mouse.wheel(0, dy); await sleep(160); };

// The article's own end, captured BEFORE any room is prepared. Everything else has
// to measure against this: `maxScroll` grows as rooms are appended, so a loop that
// chases it walks straight down the whole staircase instead of stopping at stop 1.
let articleEnd = 0;

const reset = async (opts = {}) => {
  await page.goto('http://localhost:5173/prototype.html#/gesture/native');
  await page.waitForSelector('.pull__panel--nativescroll');
  await sleep(350);
  await setRange('Hold', opts.hold ?? 1000);
  await setRange('Return', opts.ret ?? 400);
  await setRange('Settle', opts.settle ?? 120);
  await setRange('Peek', opts.peek ?? 100);
  await setRange('Commit', opts.commit ?? 60);
  const g = await probe();
  // NOT `maxScroll` — `reset()` does not reload, so a room prepared by the previous
  // section is still there and would be counted as part of the article. Subtracting
  // the footer gives the article's own end whatever state we inherited.
  articleEnd = g.maxScroll - g.footerH;
  await page.mouse.move(640, g.cardBottom - 60);
  return g;
};

/** Wait for the scroll position to stop changing — Chrome ANIMATES a wheel
 *  scroll, so probing too early reads an intermediate position and provokes an
 *  extra scroll that legitimately opens the footer. */
const settle = async () => {
  let prev = -1;
  for (let i = 0; i < 20; i++) {
    const s = await probe();
    if (s.scrollTop === prev) return s;
    prev = s.scrollTop;
    await sleep(70);
  }
  return probe();
};

/** Scroll to the end of the ARTICLE and stop there — not to `maxScroll`, which
 *  grows underneath you as rooms are prepared. */
const toEnd = async () => {
  // `reset()` re-navigates to the same hash URL, which does NOT reload — so a
  // section can inherit a revealed panel from the one before it and start PAST the
  // article end. Wind back first, or this returns immediately and every later
  // measurement is taken from the wrong place.
  for (let i = 0; i < 30; i++) {
    const s = await settle();
    if (s.scrollTop <= articleEnd + 1) break;
    await page.mouse.wheel(0, -120);
    await sleep(120);
  }
  for (let i = 0; i < 30; i++) {
    const s = await settle();
    if (s.scrollTop >= articleEnd - 1) return s;
    await sleep(260);
    await page.mouse.wheel(0, Math.min(240, articleEnd - s.scrollTop));
  }
  return settle();
};

/** At the article end with the peek room prepared and nothing revealed — the state
 *  a settled stop 1 leaves you in. */
const atStop1 = async () => {
  await toEnd();
  for (let i = 0; i < 40; i++) {
    const s = await probe();
    if (s.footerH >= 100 && s.revealedPx <= 1) return s;
    await sleep(120);
  }
  return probe();
};

const toArmed = async () => {
  await atStop1();
  for (let i = 0; i < 20; i++) {
    if ((await settle()).phase === 'armed') break;
    await page.mouse.wheel(0, 40);
  }
  return probe();
};

/** Armed AND settled, so the commit room below is prepared and waiting. */
const toArmedPrepared = async () => {
  const a = await toArmed();
  for (let i = 0; i < 20; i++) {
    const s = await probe();
    if (s.footerH > 100) return s;
    await sleep(80);
  }
  return a;
};

// --- 1. Rest state + the snap wiring ---------------------------------------
{
  const rest = await reset();
  check('at rest: no footer, nothing revealed', rest.footerH === 0 && rest.revealedPx <= 1,
    `footer ${rest.footerH}px, revealed ${rest.revealedPx}px, phase ${rest.phase}`);
  check('snap gravity live on the sheet end while there is no footer',
    rest.snapType === 'y' && rest.sheetSnap === 'end',
    `scroll-snap-type: ${rest.snapType} (bare = proximity, the initial strictness), sheet: ${rest.sheetSnap}`);
}

const parkedAtEnd = async () => {
  await toEnd();
  for (let i = 0; i < 50; i++) {       // hold withdraws the reveal, settle re-prepares
    const s = await probe();
    if (s.revealedPx <= 1 && s.footerH >= 100) return s;
    await sleep(120);
  }
  return probe();
};

// --- 2. Inertia cannot walk itself into the panel; a finger can, at once -----
// The listener is passive, so the browser scrolls before telling us — measured, an
// arriving event reports scrollTop already at the end. That's deliberate: a
// fingers-down scroll opens the room in the same motion, which is what removed the
// awkward wait. The stop that matters is inertia's, and that is what's checked here.
//
// Caveat on method: dispatched wheel events can carry the momentum flag but cannot
// scroll (untrusted events perform no default action), and CDP's real scrolls
// cannot carry the flag. So this starts from a parked-at-the-end state, where no
// scrolling is needed to exercise the decision.
{
  // Settle is raised above the harness's own scroll cadence so the approach itself
  // never counts as "stopped" — otherwise the room is prepared before there is
  // anything to assert. parkedAtEnd() is deliberately NOT used: it waits FOR the
  // room, which is the state this section exists to rule out.
  const rest = await reset({ hold: 1000, ret: 300, settle: 400 });
  const parked = await toEnd();
  check('reaching the end while still gesturing prepares nothing',
    parked.footerH === 0, `footer ${parked.footerH}px at ${parked.scrollTop}/${rest.maxScroll}`);

  // While input keeps arriving the room must NOT be prepared. This is the whole
  // safety property: you arrive at a stop with momentum still running, and room that
  // exists too early is room the tail spends for you. Dispatched events can't scroll,
  // which is exactly the pinned-at-the-boundary condition, so they reproduce it.
  let openedDuring = false;
  for (let i = 0; i < 8; i++) {
    await wheel(120, true);
    await sleep(120); // well inside the 400ms settle
    if ((await probe()).footerH > 0) { openedDuring = true; break; }
  }
  check('inertia still arriving keeps the room unprepared', !openedDuring,
    `footer ${(await probe()).footerH}px after 8 momentum events at 120ms spacing`);

  // A finger stream is refused for the same reason — it is input, and input means
  // the gesture is not over. Nothing about the momentum FLAG is load-bearing here,
  // which is why this rig no longer depends on it.
  let openedByFinger = false;
  for (let i = 0; i < 5; i++) {
    await wheel(60, false);
    await sleep(120);
    if ((await probe()).footerH > 0) { openedByFinger = true; break; }
  }
  check('nor does an unbroken finger stream', !openedByFinger,
    `footer ${(await probe()).footerH}px after 5 events 120ms apart, settle 400ms`);

  // Stop, and the room is prepared for you — without a further scroll, and without
  // revealing anything. That is the change: the next scroll is pure travel.
  await sleep(700);
  const prepared = await probe();
  check('stopping prepares the room, revealing nothing',
    prepared.footerH === 100 && prepared.revealedPx <= 1,
    `footer ${prepared.footerH}px, revealed ${prepared.revealedPx}px, phase ${prepared.phase}`);
  check('and preparing it does not move the content',
    prepared.scrollTop === parked.scrollTop,
    `scrollTop ${parked.scrollTop} → ${prepared.scrollTop}`);
  await setRange('Settle', 120);
}

// --- 3. Step 1 → 2, and the opening gesture continues into the room ---------
// The room is applied to the DOM synchronously now, so the gesture that earns a
// stage can reach into it — Chrome's own in-flight scroll animation continues once
// the content grows. That is the intent: opening and travelling are one motion.
//
// The invariant is therefore NOT "nothing moves" (it did, by exactly the gesture's
// own delta) but "nothing JUMPS": the content must never travel further than the
// scroll you actually made, which is what a re-layout jerk would look like.
{
  await reset();
  const end = await toEnd();
  await deliberate(60);
  const opened = await probe();
  check('a new gesture at the end appends the footer', opened.footerH > 0, `footer ${opened.footerH}px`);
  check('appending the footer never moves the content further than the gesture itself',
    opened.scrollTop >= end.scrollTop && opened.scrollTop <= end.scrollTop + 61,
    `scrollTop ${end.scrollTop} → ${opened.scrollTop} (scrolled 60)`);
  check('snap is released once the footer exists', opened.snapType === 'none',
    `scroll-snap-type: ${opened.snapType}`);
}

// --- 4. A partial reveal withdraws itself ----------------------------------
{
  await reset({ hold: 1000, ret: 300 });
  await parkedAtEnd();           // room already prepared; nothing revealed
  await page.mouse.wheel(0, 40); // reveal a sliver
  await sleep(300);
  const nibbled = await settle();
  await sleep(1800);             // hold 1000 + return 300 + margin
  const back = await probe();
  // The room stays PREPARED after the withdrawal — resting at the article end is
  // exactly the condition that prepares it. What has to go back to zero is the
  // reveal, not the room.
  check('a small reveal withdraws itself', nibbled.revealedPx > 2 && back.revealedPx <= 1,
    `revealed ${nibbled.revealedPx}px → ${back.revealedPx}px (footer stays prepared at ${back.footerH}px)`);
}

// --- 5. Armed, and the withdrawal is eased --------------------------------
{
  const rest = await reset();
  const armed = await toArmed();
  check('scrolling the footer in arms it',
    armed.phase === 'armed' && /reveal 100\/100px/.test(armed.readout),
    `${armed.readout.split('|')[0].trim()}, "${armed.label}"`);
  check('card box never moved', armed.transform === 'none' && armed.cardBottom === rest.cardBottom,
    `transform ${armed.transform}, bottom ${armed.cardBottom}`);

  await page.evaluate(() => {
    window.trace = [];
    const sc = document.querySelector('.pull__panel--nativescroll');
    const t0 = performance.now();
    const tick = () => {
      window.trace.push([Math.round(performance.now() - t0), Math.round(sc.scrollTop)]);
      if (performance.now() - t0 < 2600) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await sleep(2400);
  const after = await probe();
  const trace = await page.evaluate(() => window.trace);
  const tops = trace.map(([, t]) => t);
  const distinct = [...new Set(tops)];
  const movedAt = trace.find(([, t]) => t < tops[0] - 1);
  // Room stays prepared — resting at the article end is what prepares it. The
  // REVEAL is what withdraws.
  check('waiting on the offer withdraws it', after.revealedPx <= 1 && after.phase === 'idle',
    `revealed ${after.revealedPx}px, phase ${after.phase} (footer stays prepared at ${after.footerH}px)`);
  check('the withdrawal is eased, not a jump', distinct.length >= 8,
    `${distinct.length} distinct positions, ${tops[0]} → ${tops[tops.length - 1]}px`);
  check('it waits out the hold before moving', movedAt && movedAt[0] > 700,
    `started moving at ${movedAt?.[0]}ms (hold 1000ms)`);
}

// --- 6. The reported bug: a quick second flick after a fling --------------
{
  await reset({ hold: 4000 });
  const armed = await toArmed();
  check('re-armed for the momentum test', armed.phase === 'armed', `phase ${armed.phase}`);

  await wheel(40, true);
  await sleep(50);
  const duringTail = await probe();
  check('a fling tail does not confirm', duringTail.phase === 'armed',
    `phase ${duringTail.phase} after momentum:true`);

  // A real flick straight after the tail earns the commit ROOM — a new gesture is
  // exactly what the gate is for. What it does NOT do is archive: the room opens
  // and the distance still has to be run.
  // The room was prepared by settling, so a flick has nothing to earn — and must
  // not archive either. Dispatched events can't scroll, so this asserts the
  // decision, not the travel.
  await wheel(40, false); // a real flick, immediately — no gap at all
  await sleep(120);
  const flicked = await probe();
  check('a flick at the armed stop does not archive',
    flicked.phase === 'armed' && /commit 0\//.test(flicked.readout),
    `phase ${flicked.phase}, ${flicked.readout.split('|')[0].trim()}`);

  // Travelling the room is the archive, and it takes real scrolls to do it.
  for (let i = 0; i < 12 && (await probe()).phase !== 'activated'; i++) {
    await page.mouse.wheel(0, 30);
    await sleep(70);
  }
  const committed = await probe();
  check('running out the commit travel archives', committed.phase === 'activated',
    `phase ${committed.phase}`);

  await sleep(1600);
  const filed = await probe();
  check('files away and resets', filed.phase === 'idle' && filed.revealedPx <= 1,
    `phase ${filed.phase}, footer ${filed.footerH}px`);
}

// --- 7. Two pushes inside ONE gesture are still one gesture ---------------
{
  await reset({ hold: 4000 });
  await toArmed();
  await wheel(40, false); // same finger-down gesture continuing: no gap
  await sleep(30);
  const same = await probe();
  check('a second push with no gap and no fling is NOT a new gesture',
    same.phase === 'armed',
    `phase ${same.phase} — one physical gesture must not confirm itself`);
}


// --- 8. The drag path: release commits, release always springs home ---------
{
  const rest = await reset({ hold: 4000 });
  const x = 640;
  const dragTo = async (steps, step = 24, startOffset = 40) => {
    let y = rest.cardBottom - startOffset;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 0; i < steps; i++) {
      y -= step;
      await page.mouse.move(x, y);
      await sleep(16);
    }
    return probe();
  };

  // One continuous drag runs the WHOLE staircase: it hauls past the article end
  // (opening the peek room), pulls the panel out, hauls past that (opening the
  // commit room) and travels it — so it archives on arrival, without a release.
  // A drag has an explicit start, so unlike the wheel it earns each stop as it
  // goes; the distance is still the distance.
  const held = await dragTo(30);
  check('one drag runs the whole staircase and archives',
    held.footerH > 0 && held.phase === 'activated',
    `footer ${held.footerH}px, revealed ${held.revealedPx}px, phase ${held.phase}`);

  await page.mouse.up();
  await sleep(1600);
  const filed = await probe();
  check('and it settles home afterwards', filed.phase === 'idle' && filed.revealedPx <= 1,
    `phase ${filed.phase}, revealed ${filed.revealedPx}px`);
}

// --- 8b. A drag that stops INSIDE the commit room commits on release ---------
// The one place the two paths differ on purpose: a drag has a release, so
// entering the commit room and letting go is enough. A wheel has no release, so
// it must run the travel out. Both still require hauling past both stops.
{
  const rest = await reset({ hold: 4000 });
  const x = 640;
  let y = rest.cardBottom - 40;
  await page.mouse.move(x, y);
  await page.mouse.down();
  let entered = null;
  for (let i = 0; i < 30; i++) {
    y -= 12;
    await page.mouse.move(x, y);
    await sleep(16);
    const s = await probe();
    // Stop as soon as the commit room exists and we've barely entered it.
    if (s.label === 'Release to archive') { entered = s; break; }
  }
  check('a drag part-way into the commit room offers release',
    entered !== null && entered.phase === 'armed',
    entered ? `label "${entered.label}", phase ${entered.phase}` : 'never offered release');

  await page.mouse.up();
  await sleep(140);
  const released = await probe();
  check('releasing inside the commit room archives — no full travel needed',
    released.phase === 'activated', `phase ${released.phase}`);
  // Let the archive settle before the next scenario. `reset()` re-navigates to the
  // same hash URL, which is a SAME-DOCUMENT navigation — it does not reload, so a
  // scenario that ends mid-animation leaks its state into the next one.
  await sleep(1800);
}

// --- 9. A drag released SHORT springs back, briskly -------------------------
{
  const rest = await reset({ hold: 4000 });
  const x = 640;
  // Park at the article end FIRST. A drag is 1:1 from where it started, so a drag
  // that also scrolls the article arrives at the footer with hundreds of px of
  // travel banked — the instant room appears it spends all of it, blows through the
  // peek stage and lands in the commit room, where releasing SHOULD archive. That
  // is a different test. Starting from the end makes a nibble an actual nibble.
  await page.evaluate((end) => {
    const sc = document.querySelector('.pull__panel--nativescroll');
    sc.dataset.articleEnd = String(end);
    sc.scrollTop = Number(sc.dataset.articleEnd);
  }, articleEnd);
  await sleep(200);
  let y = rest.cardBottom - 40;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 0; i < 20; i++) {
    const s = await probe();
    if (s.footerH > 0 && s.revealedPx > 10) break;
    y -= 8;
    await page.mouse.move(x, y);
    await sleep(16);
  }
  const partial = await probe();
  await page.mouse.up();
  await sleep(450); // SPRING_MS 280 + margin — far shorter than any hold
  const sprung = await probe();
  check('a drag released short springs back on its own',
    partial.revealedPx > 5 && partial.revealedPx < 100 && sprung.revealedPx <= 1,
    `revealed ${partial.revealedPx}px → ${sprung.revealedPx}px in <450ms (hold is 4000ms)`);
  check('springing back does not archive', sprung.phase !== 'activated', `phase ${sprung.phase}`);
}

// --- 10. A click on an already-open panel must not archive ------------------
{
  await reset({ hold: 8000 });
  const armed = await toArmed();
  check('armed via the wheel for the click test', armed.phase === 'armed', `phase ${armed.phase}`);
  await page.mouse.down();
  await sleep(60);
  await page.mouse.up();
  await sleep(150);
  const clicked = await probe();
  check('a click while armed does not archive', clicked.phase !== 'activated',
    `phase ${clicked.phase} — only a drag that pulled it out may commit on release`);
}

// --- 11. The second stage: commit room is APPENDED, and travel is the archive -
// The whole point of the redesign. Every assertion here is about the gate no
// longer deciding the archive — it only decides whether more room exists.
//
// Gap is raised past a CDP round-trip for this scenario: at 50ms every harness
// scroll reads as a separate gesture, so the reveal loop would earn stage 2 on its
// way to armed and leave nothing to assert. Note also that `toEnd` alone arrives
// already armed for the same reason — pace the reveal with `settle`, never a bare
// sleep, or the extra scroll it provokes opens the commit room behind your back.
{
  await reset({ hold: 8000 });
  await setRange('Settle', 300);
  await setRange('Peek', 100);
  await setRange('Commit', 90);

  let a = await toEnd();
  for (let i = 0; i < 40 && a.phase !== 'armed'; i++) {
    await page.mouse.wheel(0, 30);
    a = await settle();
  }
  // The room is appended on a settle timer, so the loop can exit at the very instant
  // of arming and read a state one tick too early. Wait the timer out explicitly
  // rather than relying on `settle()` happening to be slower than it.
  await sleep(400);
  a = await probe();
  // Armed, settled, and the commit room prepared below — but UNTRAVELLED. The
  // gesture that armed the panel ran out of room before the room existed, which is
  // what stops a fling from carrying straight on through the offer.
  check('arming then settling prepares the commit room, empty',
    a.phase === 'armed' && a.footerH === 190 && /commit 0\//.test(a.readout),
    `phase ${a.phase}, footer ${a.footerH}px, ${a.readout.split('|')[0].trim()}`);

  for (let i = 0; i < 6; i++) await wheel(40, true);
  await sleep(120);
  const tail = await probe();
  check('a fling tail does not archive from the armed stop', tail.phase === 'armed',
    `phase ${tail.phase}, ${tail.readout.split('|')[0].trim()}`);

  // A SMALL scroll, deliberately: a large one runs the whole commit distance in one
  // motion (which is the intent) and leaves nothing to assert about partial travel.
  const before = await probe();
  await sleep(900);
  await page.mouse.wheel(0, 20);
  await sleep(600);
  const opened = await probe();
  check('the next scroll is pure travel — no gate, no append to pay for',
    opened.scrollTop > before.scrollTop && opened.scrollTop <= before.scrollTop + 21,
    `scrollTop ${before.scrollTop} → ${opened.scrollTop} (scrolled 20) — no dead step`);
  check('but it does not archive on its own', opened.phase === 'armed',
    `phase ${opened.phase} — the distance still has to be run`);

  await page.mouse.wheel(0, 20);
  await sleep(200);
  const half = await probe();
  check('partial commit travel does not archive', half.phase === 'armed', `phase ${half.phase}`);
  // The travel has to LOOK like a transition, not like a second identical stop.
  // Phase stays 'armed' throughout, so the colour is the only thing carrying it.
  check('the commit travel shifts the backdrop colour as it goes',
    half.bg !== opened.bg && half.phase === opened.phase,
    `${opened.bg} → ${half.bg} (both phase ${half.phase})`);

  for (let i = 0; i < 12 && (await probe()).phase !== 'activated'; i++) {
    await page.mouse.wheel(0, 30);
    await sleep(70);
  }
  check('running the commit travel out archives', (await probe()).phase === 'activated');
}

// --- 12. Scrolling back up surrenders the commit room ------------------------
{
  await reset({ hold: 8000 });
  const on = await toArmedPrepared(); // armed, settled, commit room waiting
  // Enough to undo the carry AND un-arm: the room is surrendered when the travel
  // that earned it is undone, not merely when the commit travel returns to zero.
  await page.mouse.wheel(0, -40);
  await sleep(300);
  const back = await settle();
  check('scrolling back up gives the commit room back',
    on.footerH === 160 && back.footerH === 100,
    `footer ${on.footerH} → ${back.footerH}px, phase ${back.phase}`);
}

// --- 13. The whole thing in THREE scrolls, with no dead step ----------------
// The acceptance criterion in plain terms: reach the end, scroll again to be
// offered the archive, scroll once more and it is archived. Any step that changes
// nothing you can see is a bug, however defensible it is internally.
{
  // Park with a SHORT hold — `parkedAtEnd` gets there by waiting for the withdrawal
  // — then lengthen it so the offer survives the reading pause between scrolls.
  await reset({ hold: 1000, ret: 300 });
  const parked = await parkedAtEnd(); // scroll 1 has happened: at the end, no room
  await setRange('Hold', 8000);
  check('scroll 1 lands at the article end with nothing revealed',
    parked.revealedPx <= 1 && parked.phase === 'idle',
    `revealed ${parked.revealedPx}px, phase ${parked.phase} (room prepared at ${parked.footerH}px)`);

  await deliberate(120);
  await sleep(300);
  const offered = await probe();
  check('scroll 2 reveals the panel and offers the archive',
    offered.phase === 'armed' && /archive/i.test(offered.label),
    `phase ${offered.phase}, label "${offered.label}"`);

  await deliberate(120);
  await sleep(300);
  const archived = await probe();
  check('scroll 3 archives — no fourth scroll, no step that only moves the meter',
    archived.phase === 'activated', `phase ${archived.phase}, label "${archived.label}"`);
}

// --- 14. A fling cannot walk itself through the offer ------------------------
// Regression: a fast double-flick once went from the article bottom to "Archived"
// without the offer ever being readable. The cause was a settle timer — the one
// mechanism that could open a room while a gesture was still live. It is gone, and
// the gate cannot do that by construction, because inertia is refused outright.
// This pins that property at the SECOND stop, where the consequence is irreversible.
{
  await reset({ hold: 8000 });
  await toArmedPrepared();
  // Scroll back off the stop so the commit room is surrendered, then re-arm with a
  // long settle window — that is the state where "does inertia earn it?" is a real
  // question rather than one already answered.
  await page.mouse.wheel(0, -40);
  await sleep(300);
  await setRange('Settle', 3000);
  for (let i = 0; i < 20; i++) {
    if ((await settle()).phase === 'armed') break;
    await page.mouse.wheel(0, 20);
  }

  // Dispatched events carry the momentum flag but cannot scroll — which is exactly
  // the pinned-at-the-maximum condition a real fling tail hits here, so they
  // reproduce it faithfully. No quantity of inertia may earn the room.
  let openedByInertia = false;
  for (let i = 0; i < 12; i++) {
    await wheel(40, true);
    await sleep(60);
    if ((await probe()).footerH > 100) { openedByInertia = true; break; }
  }
  check('no amount of inertia opens the commit room', !openedByInertia,
    `footer ${(await probe()).footerH}px after 12 momentum events over ~0.7s`);

  // An unbroken FINGER stream is refused too — that is what stops a single hard
  // flick from arming and continuing straight through. Driven via the Gap slider,
  // since a real continuous gesture can't be synthesised (see the README).
  let openedByStream = false;
  for (let i = 0; i < 5; i++) {
    await wheel(60, false);
    await sleep(100); // one motion at a 300ms gap
    if ((await probe()).footerH > 100) { openedByStream = true; break; }
  }
  check('nor does an unbroken finger stream', !openedByStream,
    `footer ${(await probe()).footerH}px after 5 events 100ms apart, gap 300ms`);

  // Stop, and the room is prepared without any further gesture at all.
  await sleep(600);
  const earned = await probe();
  check('stopping prepares the commit room, no gesture needed', earned.footerH > 100,
    `footer 100 → ${earned.footerH}px`);
}

console.log(await page.evaluate(() => `\nplatform: WheelEvent.momentum present = ${'momentum' in WheelEvent.prototype}`));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
