// Stage voice-over with the browser's built-in speechSynthesis. No external APIs.
// One line at a time from a queue, so voices never overlap. Each agent gets a calm English voice;
// each ingredient gets its own playful pitch and rate. Only the stage screen imports this.

const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
const MAX_BEHIND = 2;                         // lines waiting before we start dropping extras
const PRIORITY = { extra: 1, normal: 2, key: 3 };
const AGENTS = ['@pantry', '@chef-assistant', '@margin-critic'];
const AGENT_STYLE = {
  '@pantry': { pitch: 0.95, rate: 0.95 },
  '@chef-assistant': { pitch: 1.05, rate: 1.0 },
  '@margin-critic': { pitch: 0.85, rate: 0.9 },
};
// Natural-sounding voices first. Novelty voices (macOS "Bubbles", "Zarvox" and friends) are never used.
const PREFERRED = ['Samantha', 'Daniel', 'Karen', 'Moira', 'Serena', 'Tessa', 'Google US English', 'Google UK English Female',
  'Google UK English Male', 'Microsoft Aria', 'Microsoft Jenny', 'Microsoft Guy', 'Alex'];
const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|eddy|flo|fred|good news|grandma|grandpa|jester|junior|kathy|organ|ralph|reed|rocko|sandy|shelley|superstar|trinoids|whisper|wobble|zarvox/i;

let enabled = true;
let unlocked = Boolean(typeof navigator !== 'undefined' && navigator.userActivation?.hasBeenActive);
let queue = [];
let current = null;
let gen = 0;               // bumps on reset/mute so callbacks from cancelled speech are ignored
let ingredientLines = 0;   // the night's first ingredient line is kept; later ones are "extra"
let voices = [];

// Speech log for testing: window.__voiceLog holds { speaker, text, start, end }.
const log = [];
if (typeof window !== 'undefined') window.__voiceLog = log;

function loadVoices() { voices = synth?.getVoices() || []; }
if (synth) { loadVoices(); synth.addEventListener?.('voiceschanged', loadVoices); }

function englishVoices() {
  const rank = (v) => { const i = PREFERRED.findIndex((p) => v.name.startsWith(p)); return i < 0 ? 99 : i; };
  return voices
    .filter((v) => /^en([-_]|$)/i.test(v.lang) && !NOVELTY.test(v.name))
    .sort((a, b) => rank(a) - rank(b) || Number(b.localService) - Number(a.localService) || a.name.localeCompare(b.name));
}

const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261);

function styleFor(speaker) {
  const en = englishVoices();
  const slot = AGENTS.indexOf(speaker);
  if (slot >= 0) return { voice: en[slot % (en.length || 1)] || null, ...AGENT_STYLE[speaker] };
  // Ingredients: a fourth voice if there is one, with a pitch and rate fixed by the name.
  const h = hash(speaker);
  return { voice: en[3 % (en.length || 1)] || en[0] || null, pitch: 0.8 + (h % 100) / 100, rate: 1.05 + ((h >>> 8) % 31) / 100 };
}

function enqueue(line) {
  if (!synth || !enabled || !unlocked) return;
  queue.push(line);
  // Too far behind the screen: drop the oldest extra ingredient lines first.
  while (queue.length > MAX_BEHIND) {
    const lowest = Math.min(...queue.map((l) => l.priority));
    if (lowest > PRIORITY.extra) break;
    queue.splice(queue.findIndex((l) => l.priority === lowest), 1);
  }
  pump();
}

function pump() {
  if (current || !queue.length) return;
  current = queue.shift();
  speakPart(current, 0, gen);
}

function speakPart(line, i, myGen) {
  if (myGen !== gen) return;
  if (i >= line.parts.length) { current = null; pump(); return; }
  const part = line.parts[i];
  setTimeout(() => {
    if (myGen !== gen) return;
    const style = styleFor(line.speaker);
    const u = new SpeechSynthesisUtterance(part.text);
    if (style.voice) { u.voice = style.voice; u.lang = style.voice.lang; } else u.lang = 'en-US';
    u.pitch = style.pitch;
    u.rate = style.rate;
    const entry = { speaker: line.speaker, text: part.text, start: performance.now(), end: null };
    log.push(entry);
    let finished = false;
    const next = () => {
      if (finished) return;
      finished = true;
      clearTimeout(watchdog);
      entry.end = performance.now();
      speakPart(line, i + 1, myGen);
    };
    // Some browsers occasionally never fire onend; don't let one stuck line freeze the queue.
    const watchdog = setTimeout(() => { synth.cancel(); next(); }, 2500 + part.text.length * 110);
    u.onend = next;
    u.onerror = next;
    synth.speak(u);
  }, part.pause || 0);
}

const sentence = (parts, speaker, priority) => ({ speaker, priority, parts: parts.map((p) => (typeof p === 'string' ? { text: p } : p)) });

// ---------- public API ----------

/** Call from the first click or key press: browsers block speech until then. */
export function unlock() {
  if (unlocked) return;
  unlocked = true;
  synth?.resume?.();
}
export const isUnlocked = () => unlocked;
export const isSupported = () => Boolean(synth);

export function setEnabled(on) {
  enabled = on;
  if (!on) reset();
}

/** Stop talking and forget what's queued (mute, or a new night). */
export function reset() {
  gen++;
  queue = [];
  current = null;
  ingredientLines = 0;
  synth?.cancel();
}

/** Speak the short version of a room message, if it has one. */
export function speakMessage(m) {
  if (m.from === 'Chef' || m.kind === 'memory') return;

  if (m.from === '@pantry') {
    if (m.text.startsWith('Closing count done')) enqueue(sentence(['Closing count done. Waking up the shelf.'], '@pantry', PRIORITY.normal));
    return;
  }
  if (m.from === '@chef-assistant') {
    // Only the final question to the chef.
    if (!m.text.startsWith('Chef,')) return;
    const n = Number(m.text.match(/Chef, (\d+) special/)?.[1]);
    const text = n ? `Chef, ${n === 1 ? 'one special needs' : `${n} specials need`} your call.` : 'Chef, nothing passed the critic tonight.';
    enqueue(sentence([text], '@chef-assistant', PRIORITY.key));
    return;
  }
  if (m.from === '@margin-critic') {
    const name = m.text.split(': ')[0];
    if (m.kind === 'blocked') enqueue(sentence([`${name}.`, { text: 'Blocked.', pause: 900 }], '@margin-critic', PRIORITY.key));
    else if (m.kind === 'approved') enqueue(sentence([`${name}.`, { text: 'Approved.', pause: 250 }], '@margin-critic', PRIORITY.key));
    return;
  }
  if (m.kind === 'expiring' || m.kind === 'low') {
    const we = /s$/i.test(m.from);
    const when = /expire tonight/.test(m.text) ? 'tonight' : 'tomorrow';
    const text = m.kind === 'expiring'
      ? `${m.from} here. ${we ? 'We' : 'I'} expire ${when}!`
      : `${m.from} here. ${we ? "We're" : "I'm"} running low!`;
    enqueue(sentence([text], m.from, ingredientLines++ === 0 ? PRIORITY.normal : PRIORITY.extra));
  }
}

/** The sunrise line once the menu card is live. */
export function speakSunrise(card) {
  if (!card) return;
  enqueue(sentence([`Good morning. Tonight's special: ${card.name}, $${card.price.toFixed(2)}.`], '@chef-assistant', PRIORITY.key));
}
