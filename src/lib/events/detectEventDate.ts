// Deterministic event-date recognition over email text (subject + snippet).
// Powers "snooze until relative to the event" — so it is deliberately
// conservative: explicit calendar dates only, no NLP, no guessing from bare
// weekday names. Day resolution; times are ignored.

export interface DetectedEvent {
  /** Local midnight of the event day. */
  date: Date;
  /** The text that matched, for showing the user why we offered it. */
  matchedText: string;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const MONTH_PATTERN =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|' +
  'aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const ISO_DATE = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
const MONTH_DAY = new RegExp(
  `\\b${MONTH_PATTERN}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?\\b`, 'gi');
const DAY_MONTH = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_PATTERN}(?:,?\\s+(20\\d{2}))?\\b`, 'gi');
// US month/day; a second slash+year is consumed so "3/1/2020" can't re-match
// as a yearless "3/1".
const NUMERIC_MDY = /\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}|\d{2}))?\b/g;

interface Candidate {
  year: number | null; // null = infer from `now`
  month: number;       // 0-based
  day: number;
  matchedText: string;
}

function monthIndex(name: string): number {
  return MONTHS[name.slice(0, 3).toLowerCase()];
}

function collectCandidates(text: string): Candidate[] {
  const found: Candidate[] = [];
  for (const m of text.matchAll(ISO_DATE)) {
    found.push({ year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]), matchedText: m[0] });
  }
  for (const m of text.matchAll(MONTH_DAY)) {
    found.push({ year: m[3] ? Number(m[3]) : null, month: monthIndex(m[1]), day: Number(m[2]), matchedText: m[0] });
  }
  for (const m of text.matchAll(DAY_MONTH)) {
    found.push({ year: m[3] ? Number(m[3]) : null, month: monthIndex(m[2]), day: Number(m[1]), matchedText: m[0] });
  }
  for (const m of text.matchAll(NUMERIC_MDY)) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
    found.push({ year, month: Number(m[1]) - 1, day: Number(m[2]), matchedText: m[0] });
  }
  return found;
}

function toValidDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month, day);
  const isReal = date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
  return isReal ? date : null;
}

/** Local midnight of a candidate, inferring "this year, else next" for yearless dates. */
function resolveUpcoming(candidate: Candidate, today: Date): Date | null {
  if (candidate.year !== null) {
    const date = toValidDate(candidate.year, candidate.month, candidate.day);
    return date && date.getTime() >= today.getTime() ? date : null;
  }
  const thisYear = toValidDate(today.getFullYear(), candidate.month, candidate.day);
  if (thisYear && thisYear.getTime() >= today.getTime()) return thisYear;
  return toValidDate(today.getFullYear() + 1, candidate.month, candidate.day);
}

/**
 * The earliest upcoming calendar date mentioned in the text, or null.
 * "Upcoming" includes today — an event later today is still an event.
 */
export function detectEventDate(text: string, now: Date = new Date()): DetectedEvent | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let best: DetectedEvent | null = null;
  for (const candidate of collectCandidates(text)) {
    const date = resolveUpcoming(candidate, today);
    if (!date) continue;
    if (!best || date.getTime() < best.date.getTime()) {
      best = { date, matchedText: candidate.matchedText };
    }
  }
  return best;
}
