# Automation Transparency & Control — Design

**Status:** Draft for discussion. The "minimum visible hub" (Settings → *What this app
automates*) is already shipped; this document is about where it goes next.

**Goal:** A system a non-technical user can *understand, trust, and steer* — covering both
the policies that watch their behaviour and the concrete filters those policies create.

---

## 1. The mental model (and the naming problem)

The user's own framing has two tiers:

- A **heuristic**: a policy — "if I archive most unread mail matching a fingerprint, then
  auto-archive mail like that in future."
- A **rule / filter**: a concrete instance the heuristic produced — "auto-archive mail from
  `info@spam.com`."

"Heuristic" is jargon. Rather than teach the word, we teach the *behaviour* and let the
distinction fall out of two verbs the UI already uses:

- Things that **suggest** (watch you, propose, never act alone) — the heuristic tier.
- Things that **act automatically** (run on their own until you stop them) — the rule tier.

Recommendation: **never surface the word "heuristic" in the UI.** Keep it in the code. To the
user, the top tier is an **Assistant** ("Sender fatigue") that *suggests*; the bottom tier is a
**Rule** that *acts*. The suggest→confirm→act progression is the whole trust story, so the
vocabulary should make that arrow visible.

The one relationship users must grasp: **every rule remembers which assistant created it**
(provenance). That lets us say "this rule came from Sender fatigue" and "remove every rule this
assistant made."

**The kill-switch trap, and how we resolve it (decided 2026-07-12).** Because the assistant
(suggests) and its rules (act) are separate stores, turning an assistant *off* stops only
*future suggestions* — the rules it already spawned keep firing. A lay user reads "off" as "stop
messing with my mail," so an off switch that quietly half-works is a lie waiting to happen.

We resolve it with **visibility + choice, not an interrupting prompt**:

- Disabling a suggestion just stops the suggestion. It **never forces a decision** about existing
  actions — some users deliberately want those to keep running.
- Each suggestion's row carries a CTA labelled with its **live count** — "View 4 actions from
  this suggestion" — which opens a panel listing exactly those actions (via the `origin` link).
  The count *is* the honesty: you can always see children exist and there's an obvious door to
  them.
- That actions panel offers **one-click "disable all" and "delete all"** for this suggestion's
  actions, so stopping everything is easy and deliberate — just not automatic.

(Today's shipped hub already gives *Auto-archive rules* its own master switch and per-rule
removal, so a real kill-switch exists at the rule tier now; this decision is how it evolves once
rules are navigable *children* of a suggestion.)

---

## 2. The fingerprint problem (the crux)

"Messages like that" has to become something legible. Regexes and raw filter queries are out.
Instead, a **small fixed vocabulary of match dimensions**, each expressible in one plain
sentence:

| Dimension            | Plain-English form                        | Source field            |
|----------------------|-------------------------------------------|-------------------------|
| Sender address       | "from `deals@shop.example`"               | From                    |
| Sender domain        | "from anyone at `shop.example`"           | From                    |
| Mailing list         | "on the list *Shop Deals*"                | List-Id / List-Unsub    |
| Subject contains     | "with *invoice* in the subject"           | Subject                 |
| To/Cc is (not) me    | "where I'm only Cc'd"                     | To/Cc                   |

A **fingerprint** is a named, human-readable *conjunction* of these (usually just one). Today's
Sender-fatigue fingerprint is exactly "Sender address". The value of the vocabulary is that:

- Every fingerprint renders as a sentence a user can read and veto.
- The **assistant's** (and later the AI's) job is to pick the *right dimension* from the data —
  e.g. noticing that the fatigued mail is all one mailing list and proposing "on the list *Shop
  Deals*" (which survives the sender rotating `bounce+123@…` addresses) instead of a brittle
  single address.
- It bounds what any automation can *possibly* do, which is itself a safety property.

**Prerequisite for the mailing-list dimension (don't over-promise it yet).** The triage log
currently stores only the sender address — it has *no* `List-Id`, so an assistant literally
can't notice "these are all one list" from its own data, and the existing sweep matches with
`from:"…"`, not Gmail's `list:` operator. Before the list dimension can be the flagship example
it's used as above, two concrete things must land first: (a) start recording `List-Id` /
`List-Unsubscribe` in the triage log — they're headers, not bodies, so this stays inside the
"never subjects or bodies" privacy rule; and (b) prove `list:` search actually matches the mail
we mean. Until then, treat *Sender address* / *Sender domain* as the real dimensions and the list
dimension as aspirational.

Non-goal: arbitrary boolean trees. If a case needs more than a two-clause conjunction, it's a
sign the dimension vocabulary is missing an entry — add the entry, don't add a query language.

---

## 3. Tunable parameters (the "slots")

The user is right that a heuristic has slots — `minSeen`, `minDismissRate`, the window — and
that these themselves may need to shift. Three ways to expose them, in order of how much we lean
on each:

1. **Plain-language presets (default surface).** "Suggest early / Balanced / Only when I'm
   sure." Each preset is a named bundle of the underlying numbers. Most users never go deeper.
2. **Advanced reveal (opt-in).** The exact numbers, as sliders, behind a disclosure. Power users
   and the curious can see and set them.
3. **Live consequence, always.** *Any* parameter view — preset or slider — shows the backtest
   count next to it: "At *Balanced*, this would flag **3** senders. At *Suggest early*, **11**."
   Numbers mean nothing to a lay user; *consequences* do.

On the meta-problem — "the slots themselves drift over time": **the app should never silently
re-tune.** When it has evidence a threshold is wrong, it routes that through the *same*
suggest→confirm channel: "Sender fatigue keeps missing — want to relax it?" Meta-tuning is just
another suggestion.

But **be careful what counts as evidence.** The obvious signal — "you dismissed its last five
suggestions" — points the wrong way. The dismissal control is *Don't suggest again*, which means
"not **this sender**," not "you're too sensitive." Relaxing the threshold in response would
produce *more* unwanted suggestions. So: only treat a dismissal as tuning evidence when it's a
*near-miss* (the sender sat just over the line), and only ever offer **tightening** in response
to rejections; offer **loosening** only when the user manually acts on mail the assistant
*didn't* flag. When in doubt, propose nothing — a silent, correctly-calibrated assistant beats a
chatty one that second-guesses itself.

---

## 4. Preview / backtest — the trust engine

The single highest-leverage feature — *if the number is honest.* Before anything turns on or
changes, answer **"show me what this would do"** against real mail. The trap to avoid: a
confidently-wrong count is worse for trust than no count. Neither data source can reconstruct a
true "would have archived 12 in the last 30 days":

- The **triage log** is a *sample* — "messages seen in the top-of-inbox fetch while the app was
  open," deduped and capped. Mail handled while the app was closed was never logged.
- A **Gmail search** can't rebuild the historical inbox: mail that *was* in the inbox 30 days ago
  has since been archived/read and left `in:inbox`, and searching all mail can't tell "would've
  been caught" from "already handled."

So the preview is **forward-looking and honestly sourced**, never one fabricated integer:

- **"Matches N messages currently in your inbox"** — from a live, read-only `q=` search we *can*
  run accurately. This is the real, checkable consequence of turning the rule on now.
- **"From your logged activity, you archived ~M of the last K from this sender unread"** — the
  behavioural signal, clearly labelled as *your activity*, kept separate from the inbox count.

No writes during preview, ever. The same component fronts enabling a rule, changing a parameter,
and (later) accepting an AI-authored rule. It converts an abstract threshold into a concrete,
*verifiable* consequence — the honesty of the number is the whole point.

---

## 5. Layered control + the audit log

Four independently reversible layers:

1. **Assistant on/off** — *(shipped)*.
2. **Assistant definition / parameters** — presets + advanced, always previewed *(§3)*.
3. **Individual rules** — enable / disable / remove each; "remove all from this assistant"
   *(remove is shipped)*.
4. **Audit log** — a feed of *what automations actually did*: "Auto-archived 3 from `deals@…`
   on Jul 12," each with an **Undo**. This is the missing half of transparency: today you can
   see the *rules*, but not their *actions*.

**This is not a veneer over the existing undo.** Interactive writes support undo only because
they hand back an inverse *scoped to the threads that actually changed*. The auto-archive sweep
deliberately does the opposite — it returns just `{ archived: number }` and throws the thread IDs
away ("maintenance sweeps — no inverse"). So the audit log with working undo requires real
plumbing: the sweep must **return the thread IDs it touched**, persist an audit record
`{ ruleId, threadIds, at }`, and synthesize the inverse (re-add `INBOX` to *those* threads).
Budget it as such.

There's also a *timing* gap: the sweep runs silently on every app open and only flashes an
aggregate in the 6-second undo toast, which a mid-task user misses. For a mis-firing rule the
window between "wanted mail archived" and "user notices" can be days. So audit entries should be
**persistent (not timed)** with per-thread undo, and a **brand-new rule's first sweep should ask
for one confirmation** rather than firing silently. This makes the audit log a genuine safety net
rather than a receipt printed after the mail is already buried.

---

## 6. AI's role

The AI is an *author and explainer*, never an unattended actor:

- **Intent → predicate.** "Stop bugging me about newsletters" → proposes a *Mailing list* rule,
  shown as a sentence, backtested, awaiting confirm.
- **Explain.** Any rule or assistant, described in plain language with its backtest on demand.
- **Propose assistants.** From observed behaviour, suggest new heuristics — as suggestions.
- **Suggest tuning.** As in §3.

Everything the AI does terminates in a previewed, user-confirmed step. It widens *what* can be
proposed; it never widens *what can act unattended*.

**But AI is a privacy trust boundary, and the doc must say so.** This app's whole invariant is
local-only, and the triage log stores "never subjects or bodies." Every AI feature above sends
*real mail content* (at least senders and subjects, sometimes bodies) to a model API off-device —
the single biggest reversal of the app's promise. Users who chose a local mail app to keep the
cloud out of their inbox must not have it slipped back in for a convenience feature. So:

- **Informed, explicit consent**, gated separately from everything else: "This sends the sender
  and subject of the mail you ask about to Anthropic." Off by default.
- **Minimise the payload:** prefer sender / `List-Id` / subject over bodies; never send more than
  the task needs.
- **The deterministic heuristics stay fully functional without AI** — AI is additive, never a
  dependency.
- Document this boundary *in the same hub* that documents everything else.

---

## 6a. Durability — control must outlive localStorage

The riskiest structural assumption: rules, provenance, enabled-state, *and* the audit log all
live in `localStorage`, while their **effect** — archived mail — lives permanently in Gmail.
Clearing browser data, switching devices, or Safari's ~7-day storage eviction wipes the rules and
the audit trail *while the archived mail stays gone*. Then: a fresh device sweeps from an empty
rule set (behaviour silently changes), the phone and the laptop disagree about what's running,
and the provenance that was supposed to answer "where did this mail go?" is the very thing that
evaporated. Transparency anchored to the least durable part of the system isn't transparency.

Two mitigations:

- **Persist rules / provenance / audit to storage that travels with the account** — a dedicated
  hidden Gmail label or a settings draft, or Drive `appDataFolder` (the app already holds the
  scope). localStorage becomes a cache, not the system of record.
- **Reconcile on load:** if mail has been auto-archived but no local rule explains it, detect and
  surface that ("automation ran on another device") rather than silently forgetting it.

## 7. Data model sketch

```ts
// The policy (heuristic). Static registry today; user/AI-authorable later.
interface Assistant {
  id: string;
  name: string;
  fingerprintDimension: Dimension;   // §2
  params: Record<string, number>;    // the "slots"; presets map onto these
  action: AutomationAction;          // archive | label | …
  enabled: boolean;
}

// The concrete filter a policy (or the user) produced.
interface Rule {
  id: string;
  predicate: Predicate;              // frozen, renders to one sentence
  action: AutomationAction;
  enabled: boolean;
  createdAt: number;
  origin: { kind: 'assistant'; assistantId: string } | { kind: 'user' } | { kind: 'ai' };
  lastFiredAt?: number;
}
```

`origin` (provenance) is load-bearing — it powers "where did this come from?", bulk removal by
assistant, and the tuning feedback loop.

---

## 8. Roadmap

1. **Visibility + on/off + remove rules** — *shipped.*
2. **Kill-switch honesty** — disabling/removing an assistant prompts about its child rules and
   shows their count. Small, and it closes a live mental-model trap. *(Do first — cheapest.)*
3. **Sweep captures thread IDs + persistent audit log with per-thread undo**, and a first-sweep
   confirmation for brand-new rules. This is real plumbing (the sweep currently discards the IDs
   undo needs), not a veneer — but it's the biggest trust win.
4. **Honest backtest/preview** ("matches N currently in your inbox" + separate activity stat)
   before enabling a rule or changing a parameter.
5. **Durable storage** — move rules/provenance/audit to account-travelling storage; reconcile
   orphaned archived mail on load.
6. **Editable parameters** (presets + advanced) wired to the live preview.
7. **Fingerprint vocabulary** (start by logging `List-Id`) + manual rule creation.
8. **AI authoring**, behind an explicit content-sharing consent boundary — natural language →
   previewed rule; proposed assistants; carefully-signalled tuning.

Each step is independently shippable and leaves the user with strictly more understanding and
control than the last. The reordering vs. the first draft reflects the review: kill-switch
honesty is cheaper than the audit log, and the audit log is real work rather than free.

---

## Open decisions (want the user's steer)

- **Naming:** keep "suggests / acts automatically" and never say "heuristic"? Assistant + Rule?
- **Parameters:** presets-by-default with an advanced numeric reveal, every view backtested?
- **AI:** is off-device content-sharing acceptable at all for this app, even behind explicit
  consent — or should AI features be scoped to on-device signals (senders, headers) only?
- **Durability:** worth moving the system-of-record off localStorage now (Gmail label / Drive
  appData), or accept single-device until later?
- **Next build:** kill-switch honesty first (cheap, closes a real trap), then the audit
  log — agreed?
