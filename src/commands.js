// Voice commands: a rules parser for what the chef says on stage. No browser APIs in here, so the
// server can share the name matching when it checks what the ZooWork interpreter sends back.
//
// parseCommand(text, ctx) -> null when no rule matches, otherwise
//   { action, target?, value?, note?, label? }           ready to run
//   { action, error: 'unknown' | 'ambiguous', options? }  understood the command, not the name
// ctx = { ingredients: string[], proposals: [{ id, name, approved }] }

export const ACTIONS = ['close', 'approve', 'pass', 'set_stock', 'set_expiry', 'reset', 'none'];

// ---------- text helpers ----------
const norm = (s) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9.\s/-]/g, ' ').replace(/\s+/g, ' ').trim();
const stem = (w) => w.replace(/(ies)$/, 'y').replace(/(oes|ses|xes)$/, (m) => m.slice(0, -2)).replace(/s$/, '');
const STOP = new Set(['the', 'a', 'an', 'our', 'my', 'some', 'of', 'one', 'pizza', 'special']);
const tokens = (s) => norm(s).split(/[\s/-]+/).filter((w) => w && !STOP.has(w)).map(stem);

function levenshtein(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}
const wordMatch = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && levenshtein(a, b) <= (Math.max(a.length, b.length) >= 7 ? 2 : 1));

// Score how well what was said matches a name: share of spoken words found in the name,
// with a small bonus for covering more of the name. Tolerates plurals and small mishearings.
function score(said, name) {
  const s = tokens(said), n = tokens(name);
  if (!s.length || !n.length) return 0;
  const hits = s.filter((w) => n.some((x) => wordMatch(w, x))).length;
  const covered = n.filter((x) => s.some((w) => wordMatch(w, x))).length;
  return hits / s.length + 0.25 * (covered / n.length);
}

/** Best match for a spoken name: { match } or { error: 'unknown' | 'ambiguous', options }. */
export function fuzzyFind(said, names) {
  const exact = names.find((n) => norm(n) === norm(said));
  if (exact) return { match: exact };
  const ranked = names.map((name) => ({ name, s: score(said, name) })).filter((r) => r.s >= 0.75).sort((a, b) => b.s - a.s);
  if (!ranked.length) return { error: 'unknown' };
  const ties = ranked.filter((r) => r.s >= ranked[0].s - 0.001);
  if (ties.length > 1) return { error: 'ambiguous', options: ties.slice(0, 3).map((r) => r.name) };
  return { match: ranked[0].name };
}

// ---------- numbers ----------
const SMALL = { zero: 0, oh: 0, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** "five", "twenty five", "two and a half", "1.5", "500" -> number, or null. */
export function parseNumber(text) {
  const t = norm(text).replace(/-/g, ' ');
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  let total = 0, current = 0, seen = false;
  const words = t.split(' ');
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === 'and') continue;
    if (w === 'half' || (w === 'a' && words[i + 1] === 'half')) { if (w === 'a') i++; current += 0.5; seen = true; continue; }
    if (/^\d+(\.\d+)?$/.test(w)) { current += Number(w); seen = true; }
    else if (w in SMALL) { current += SMALL[w]; seen = true; }
    else if (w in TENS) { current += TENS[w]; seen = true; }
    else if (w === 'hundred') { current = (current || 1) * 100; seen = true; }
    else if (w === 'thousand') { total += (current || 1) * 1000; current = 0; seen = true; }
    else if (w === 'point' && i + 1 < words.length) {
      const d = words[i + 1] in SMALL ? SMALL[words[i + 1]] : Number(words[i + 1]);
      if (Number.isFinite(d) && d < 10) { current += d / 10; i++; seen = true; } else return null;
    } else return null;
  }
  return seen ? total + current : null;
}

// "5", "5 kilos", "five kg", "500 grams" -> grams. A bare number means kilograms.
export function parseQuantity(text) {
  const m = norm(text).match(/^(.*?)\s*(kilograms?|kilos?|kgs?|grams?|g)?$/);
  const n = parseNumber(m[1]);
  if (n === null) return null;
  const grams = /^g(ram)?/.test(m[2] || '') ? n : n * 1000;
  return { grams: Math.round(grams), spoken: m[2] && /^g/.test(m[2]) ? `${n} grams` : `${n} kilo${n === 1 ? '' : 's'}` };
}

// ---------- specials ----------
const ORDINALS = { first: 0, '1st': 0, one: 0, top: 0, second: 1, '2nd': 1, two: 1, third: 2, '3rd': 2, three: 2 };

function findProposal(said, ctx) {
  const ready = ctx.proposals.filter((p) => p.approved);
  const t = norm(said).replace(/^(the|number)\s+/, '').replace(/\s+(one|option|special|pizza)$/, '');
  if (t === 'last') return ready.length ? { match: ready.at(-1) } : { error: 'unknown' };
  if (t in ORDINALS) return ready[ORDINALS[t]] ? { match: ready[ORDINALS[t]] } : { error: 'unknown' };
  const found = fuzzyFind(said, ctx.proposals.map((p) => p.name));
  if (found.error) return found;
  return { match: ctx.proposals.find((p) => p.name === found.match) };
}

// "the first one make it spicy" -> ["the first one", "make it spicy"]
function splitTwist(rest) {
  const m = rest.match(/^(.*?)(?:\s*,\s*|\s+)(?:but\s+|and\s+)?((?:make it|make them|add|with extra|extra|no)\s+.+)$/);
  return m ? [m[1].trim(), m[2].trim()] : [rest.trim(), ''];
}

// ---------- the parser ----------
export function parseCommand(text, ctx) {
  const t = norm(text).replace(/^(ok(ay)?|hey kitchen|kitchen|please|so|um|uh)\s+/, '').replace(/\s+please$/, '');
  if (!t) return null;

  if (/^(close|closing)( up)?( the)? (shop|store|kitchen|restaurant)$|^close up( shop)?$|^were closed$|^lets close( up| the shop)?$/.test(t)) return { action: 'close' };
  if (/^(start over|start again|reset|restart|new night|lets start over)$/.test(t)) return { action: 'reset' };

  let m = t.match(/^(?:approve|go with|lets go with|pick|choose)\s+(.+)$/);
  if (m) {
    const [target, note] = splitTwist(m[1]);
    const found = findProposal(target, ctx);
    if (found.error) return { action: 'approve', error: found.error, options: found.options, said: target };
    return { action: 'approve', target: found.match.id, label: found.match.name, note };
  }

  m = t.match(/^(?:pass on|pass|skip|reject|no to|not)\s+(.+)$/);
  if (m) {
    const [target, note] = splitTwist(m[1]);
    const found = findProposal(target, ctx);
    if (found.error) return { action: 'pass', error: found.error, options: found.options, said: target };
    return { action: 'pass', target: found.match.id, label: found.match.name, note };
  }

  // "set tomatoes to 5" or "we have 5 kilos of tomatoes"
  let ingredient = null, amount = null;
  m = t.match(/^(?:set|change|update|make|put)\s+(?:the\s+)?(.+?)\s+(?:to|at)\s+(.+)$/);
  if (m) [, ingredient, amount] = m;
  else if ((m = t.match(/^we (?:have|now have|got)\s+(.+?)\s+of\s+(.+)$/))) [, amount, ingredient] = m;
  if (ingredient) {
    const qty = parseQuantity(amount);
    if (qty) {
      const found = fuzzyFind(ingredient, ctx.ingredients);
      if (found.error) return { action: 'set_stock', error: found.error, options: found.options, said: ingredient };
      return { action: 'set_stock', target: found.match, value: qty.grams, label: qty.spoken };
    }
  }

  m = t.match(/^(?:the\s+)?(.+?)\s+(?:expires?|expiring|goes off|go off|is good until|are good until|runs out)\s+(tomorrow|today|tonight|in\s+(.+?)\s+days?|in a day)$/);
  if (m) {
    const days = m[2] === 'tomorrow' || m[2] === 'in a day' ? 1 : m[2] === 'today' || m[2] === 'tonight' ? 0 : parseNumber(m[3]);
    if (days !== null && Number.isInteger(days)) {
      const found = fuzzyFind(m[1], ctx.ingredients);
      if (found.error) return { action: 'set_expiry', error: found.error, options: found.options, said: m[1] };
      return { action: 'set_expiry', target: found.match, value: days };
    }
  }
  return null;
}

/**
 * Check a command from the ZooWork interpreter against the current state, and normalise names.
 * Returns a runnable command (same shape as parseCommand) or null.
 */
export function validateCommand(cmd, ctx) {
  if (!cmd || typeof cmd !== 'object' || !ACTIONS.includes(cmd.action) || cmd.action === 'none') return null;
  const note = typeof cmd.note === 'string' ? cmd.note.slice(0, 120) : '';
  switch (cmd.action) {
    case 'close':
    case 'reset':
      return { action: cmd.action };
    case 'approve':
    case 'pass': {
      if (typeof cmd.target !== 'string') return null;
      const found = findProposal(cmd.target, ctx);
      return found.match ? { action: cmd.action, target: found.match.id, label: found.match.name, note } : null;
    }
    case 'set_stock': {
      const grams = Number(cmd.value);
      if (typeof cmd.target !== 'string' || !Number.isFinite(grams) || grams < 0) return null;
      const found = fuzzyFind(cmd.target, ctx.ingredients);
      return found.match ? { action: 'set_stock', target: found.match, value: Math.round(grams), label: grams >= 1000 ? `${+(grams / 1000).toFixed(1)} kilos` : `${Math.round(grams)} grams` } : null;
    }
    case 'set_expiry': {
      const days = Number(cmd.value);
      if (typeof cmd.target !== 'string' || !Number.isInteger(days) || days < 0 || days > 30) return null;
      const found = fuzzyFind(cmd.target, ctx.ingredients);
      return found.match ? { action: 'set_expiry', target: found.match, value: days } : null;
    }
    default:
      return null;
  }
}
