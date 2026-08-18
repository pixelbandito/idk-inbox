# Signal Catalog & Measurement Plan

**Status:** Approved framing (2026-07-12). Foundation for agile heuristic authoring.

**Goal:** Measure a rich set of per-email *signals* and per-fingerprint *outcome statistics*,
so trends surface and new heuristics (suggestions) can be composed cheaply — with or without AI.

---

## 1. The framing: signal / stat / heuristic

Three distinct things, kept separate so the system stays composable:

1. **Fingerprint signals** — stable *properties* of a message/sender ("what kind of mail is
   this"). The **dimensions you slice by**.
2. **Outcome statistics** — *what the user did* in response, measured per fingerprint over a
   window. The **metrics you measure in each slice**.
3. **A heuristic** binds them into one sentence:

   > **When** mail matching **⟨fingerprint⟩** shows **⟨stat⟩ ⟨comparator⟩ ⟨threshold⟩** across
   > **⟨window⟩**, **propose ⟨action⟩** — gated by enough **volume + consistency** to be safe.

"Invent a heuristic" becomes "pick a slice, a metric, a threshold, an action." A person, a
settings UI, or later an AI can nominate those; the system measures whether the line is crossed.
Signals and stats grow independently.

---

## 2. Signal catalog (fingerprints)

Marked ⭐ where header/metadata-only (cheap, private, reliable) — prioritise these first.

### A. Identity & addressing
- ⭐ Real sender address; sender **domain**; local-part **role pattern** (`info`, `noreply`,
  `no-reply`, `support`, `notifications`, `bounce`, `mailer-daemon`)
- ⭐ Gmail-style `+suffix` tag on any address
- ⭐ `Reply-To` address + domain; **Reply-To domain ≠ From domain** (bulk tell)
- ⭐ Display-name vs address mismatch
- ⭐ `To`/`Cc` counts; **am I in `To`, only in `Cc`, or in neither (bulk Bcc)?** (needs the
  account address)
- ⭐ Authentication: **SPF / DKIM / DMARC** result from `Authentication-Results`
- ⭐ Sending infra / ESP from `Return-Path` or DKIM `d=` (Mailchimp, SendGrid, …)
- Known correspondent: **have I emailed this sender before** (Sent)? in contacts? first-time
  sender? — reciprocity is the strongest "real human to me" signal (needs Sent/contacts lookup)

### B. List / bulk infrastructure (headers)
- ⭐ **`List-Id`** — durable list identity (survives rotating `bounce+123@` addresses)
- ⭐ `List-Unsubscribe`; **one-click** (`List-Unsubscribe-Post`, RFC 8058)
- ⭐ `Precedence: bulk/list`, `Auto-Submitted`, `Feedback-ID` / campaign headers

### C. Thread / conversation structure (needs thread fetch)
- Thread length; participant count; 1:1 vs group vs broadcast
- Is it a reply to something **I** sent (`In-Reply-To`/`References`)? have I replied in it?
- My-messages-to-others ratio; same-domain (coworkers) vs strangers; thread age / recency

### D. Content & intent (structural proxy first; fuzzy prose last)
- ⭐ Has unsubscribe (⇒ marketing/newsletter when combined with `List-Id`)
- Structural categories: calendar (`.ics` part), security/OTP (subject pattern + short body),
  transactional/receipt (merchant + no unsubscribe), app notification (known domains)
- Fuzzy categories (your list): sales/offers, product/feature announcements, recruiting,
  donation asks, social "come back" activity, newsletters/digests, personal-from-a-human
- **Caveat:** reliable *prose* classification is the one place signal quality drops without AI.
  Prefer structural tells (headers/MIME) that need no body reading; leave prose classification
  for keyword heuristics or a later, consented AI pass.

### E. Temporal / volume (sender behaviour over time)
- Frequency (mails/week); regularity (bursty vs steady); arrival day-of-week / time-of-day
- Volume **trend** (ramping up vs baseline); this sender's **share of your inbox**

### F. Format / rendering (needs body/MIME)
- Plain vs HTML vs multipart; tracking-pixel / remote images present; link-to-text ratio;
  message size; attachment types (pdf/doc/image/`.ics`)

---

## 3. Outcome statistics

Recorded per fingerprint key, windowed.

- **Engagement:** open (thread click), reply, forward, star/important, *dwell* (open + click/
  scroll), time-to-open
- **Dismissal:** archive, delete, spam, unsubscribe
- **Deferral:** snooze **by duration** and **by pattern** (evening-before, following-Monday);
  **re-snooze rate** (avoidance)
- **Filing:** label rate **indexed by which label** (learns auto-label rules from hand-filing)
- **Rot:** time-in-inbox before action; **% never actioned** (per-sender inbox rot)
- **Conditioned forms (first-class, not derived):** `[archive|delete|snooze|unsubscribe] rate
  [with|without] [opening|clicking|replying|forwarding] first`. "Archived *without opening*" is
  a far stronger fatigue signal than "archived."
- **Consistency:** variance of behaviour toward a fingerprint — decides whether a rule is *safe
  to propose*.

---

## 4. The algebra in action

Example heuristics, all the same shape:

| Fingerprint | Stat crosses | Propose |
|---|---|---|
| `List-Id` or sender | archived-without-opening ≥ 80% (14d, ≥5) | auto-archive |
| has `List-Unsubscribe` | open rate < 10% (30d, ≥4) | unsubscribe |
| I'm only in `Cc`, many recipients | open-without-reply → archive | auto-label "FYI" / skip inbox |
| transactional structure | you labelled → Receipts ≥ N | auto-label Receipts |
| specific bill sender | consistently snoozed to "following payday" | default auto-snooze |
| replied-to ≥ N and I'm in `To` | high open/reply | **protect** from auto-archive; prioritise |
| frequency doubled vs baseline | — (volume signal) | "ramped up — mute or keep?" |

**Guardrails that fall out:** a **confidence gate** (suggest only when volume is high *and*
behaviour consistent), and a deliberate mix of **protective/positive** heuristics (VIP, keep-in-
inbox, notify) alongside the silencing ones — otherwise the system only ever learns to hide mail.

---

## 5. Measurement plan (data model)

Generalises today's `triageLog` (sightings + triage events keyed by sender).

- **Per-message signal derivation:** a pure `deriveMessageSignals(raw)` from headers (§2 A/B/D-
  structural), computed at parse time and carried on the summary.
- **Behaviour log, keyed by fingerprint:** for each key (sender address, and separately
  `List-Id`), keep rolling counters — `seen`, `opened`, `replied`, `forwarded`, `archived`,
  `archivedWithoutOpen`, `deleted`, `snoozed{byBucket}`, `labeled{byLabel}`, `unsubscribed` —
  plus timestamps for windowing. Pruned by window; bounded by distinct senders/lists, not
  per-email-forever.
- **Privacy invariant (unchanged):** store addresses, list-ids, header-derived flags, ids, and
  timestamps — **never subjects or bodies**.

---

## 6. Capture changes needed

1. **Widen header capture.** The message fetch pulls only `From/Subject/Date/List-Unsubscribe`.
   Add `To, Cc, Reply-To, List-Id, List-Unsubscribe-Post, Precedence, Auto-Submitted,
   Authentication-Results, Return-Path, In-Reply-To, References`. Headers only — cheap, private.
2. **Account address.** Fetch the profile once so `To`/`Cc` position ("am I in To?") is
   computable.
3. **Richer behaviour events.** Record open / reply / forward / label-with-value /
   snooze-with-duration, and the "without opening first" conditioning.
4. **Thread structure & MIME** (§2 C/F) come later — they need the thread/full fetch.

---

## 7. Roadmap

1. **Signal-derivation layer** — pure `deriveMessageSignals` from headers, fully tested. *(first)*
2. **Widen header capture** + carry signals on the summary.
3. **Generalise the behaviour log** to per-fingerprint counters with the richer, conditioned
   events; key by sender *and* `List-Id`.
4. **Trend surfacing** — a read-only view of the stats per fingerprint (before any heuristic
   fires), so patterns are visible and new heuristics can be proposed from evidence.
5. **Heuristic authoring** on top of the algebra (§1), each previewed before it acts.
