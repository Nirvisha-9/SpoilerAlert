// Score + sfx as one piece: 120 BPM, A minor night -> C major sunrise. Writes audio.wav (stereo 44.1k).
import fs from 'node:fs';
const SR = 44100, DUR = 22.0, N = Math.ceil(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);
const sendL = new Float32Array(N), sendR = new Float32Array(N);
const B = 0.5; // one beat
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

// add a voice: fn(tLocal) -> sample; env handled by caller
function add(start, dur, fn, { gain = 0.2, pan = 0, rev = 0.25 } = {}) {
  const s0 = Math.floor(start * SR), n = Math.floor(dur * SR);
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  let lp = 0;
  for (let i = 0; i < n && s0 + i < N; i++) {
    if (s0 + i < 0) continue;
    const v = fn(i / SR);
    L[s0 + i] += v * gl; R[s0 + i] += v * gr;
    sendL[s0 + i] += v * gl * rev; sendR[s0 + i] += v * gr * rev;
  }
}
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));

// soft pluck: two detuned triangles through a decaying brightness
function pluck(t0, m, { gain = 0.1, decay = 0.35, pan = 0, rev = 0.35, bright = 1 } = {}) {
  const f = hz(m);
  add(t0, decay * 5, (t) => {
    const ph = (x) => { const p = (x * f) % 1; return 4 * Math.abs(p - 0.5) - 1; };
    const sine = Math.sin(2 * Math.PI * f * t);
    const tri = (ph(t) + ph(t * 1.003)) / 2;
    const b = Math.exp(-t * 9) * bright;
    return env(t, 0.004, decay) * (sine * (1 - b * 0.6) + tri * b * 0.6);
  }, { gain, pan, rev });
}
function bell(t0, f, dur, gain, pan = 0, rev = 0.5) {
  add(t0, dur + 1.5, (t) => env(t, 0.008, dur * 0.5) * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * f * 2.0 * t) * Math.exp(-t * 6)), { gain, pan, rev });
}
function kick(t0, gain = 0.32) {
  add(t0, 0.4, (t) => { const f = 45 + 70 * Math.exp(-t * 30); return Math.sin(2 * Math.PI * f * t - 0) * env(t, 0.002, 0.13); }, { gain, rev: 0.02 });
}
function noiseHit(t0, dur, gain, { tone = 0.5, pan = 0, rev = 0.2, attack = 0.002 } = {}) {
  let y = 0;
  add(t0, dur * 4, (t) => { y += tone * (rnd() - y); return y * env(t, attack, dur); }, { gain, pan, rev });
}
function hat(t0, gain = 0.03, pan = 0.25) {
  let prev = 0;
  add(t0, 0.12, (t) => { const n = rnd(); const hp = n - prev; prev = n; return hp * env(t, 0.001, 0.025); }, { gain, pan, rev: 0.1 });
}
function pad(t0, dur, notes, gain, bright = 0.25) {
  // detuned saws, one-pole lowpassed, slow attack
  let y = 0;
  const fs_ = notes.flatMap((m) => [hz(m) * 0.997, hz(m) * 1.003]);
  add(t0, dur + 0.8, (t) => {
    let s = 0; for (const f of fs_) s += ((t * f) % 1) * 2 - 1;
    s /= fs_.length; y += bright * (s - y);
    const a = Math.min(1, t / 0.6), r = t > dur ? Math.max(0, 1 - (t - dur) / 0.8) : 1;
    return y * a * r;
  }, { gain, rev: 0.5 });
}
function sub(t0, dur, m, gain = 0.16) {
  const f = hz(m);
  add(t0, dur, (t) => Math.sin(2 * Math.PI * f * t) * Math.min(1, t / 0.01) * Math.min(1, (dur - t) / 0.05) * Math.exp(-t * 1.2), { gain, rev: 0 });
}
function riser(t0, dur, gain) {
  let y = 0;
  add(t0, dur, (t) => { const k = t / dur; y += (0.05 + 0.5 * k) * (rnd() - y); return y * k * k; }, { gain, rev: 0.4 });
}
function boom(t0, gain = 0.35) {
  add(t0, 1.6, (t) => Math.sin(2 * Math.PI * (38 + 80 * Math.exp(-t * 12)) * t) * env(t, 0.003, 0.45), { gain, rev: 0.15 });
}

// ---------- music ----------
// night: Am F C G (one bar each, 2s). chords as midi.
const NIGHT = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const DAY = [[48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60]];
for (let bar = 0; bar < 7; bar++) {
  const t0 = bar * 2, ch = NIGHT[bar % 4];
  const arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12, ch[0] + 24, ch[2] + 12, ch[1] + 12, ch[2] + 12];
  const level = bar === 0 ? 0.045 : bar === 1 ? 0.06 : 0.075;
  arp.forEach((m, i) => pluck(t0 + i * 0.25, m, { gain: level, decay: 0.28, pan: i % 2 ? 0.3 : -0.3 }));
  sub(t0, 2, ch[0] - 12, bar === 0 ? 0.08 : 0.15);
  if (bar >= 1) [0, 2].forEach((b) => kick(t0 + b * B, 0.14));
  if (bar >= 2) [0, 1, 2, 3].forEach((b) => hat(t0 + b * B + 0.25, 0.022));
  if (bar >= 4) [1, 3].forEach((b) => noiseHit(t0 + b * B, 0.05, 0.05, { tone: 0.6, rev: 0.3 })); // soft snap
  pad(t0, 2, ch.map((m) => m), bar < 2 ? 0.025 : 0.035, 0.08);
}
riser(12.6, 1.4, 0.08); // into sunrise
for (let bar = 7; bar < 10; bar++) {
  const t0 = bar * 2, ch = DAY[(bar - 7) % 4];
  const arp = [ch[0] + 24, ch[2] + 12, ch[1] + 24, ch[2] + 12, ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[1] + 24];
  arp.forEach((m, i) => pluck(t0 + i * 0.25, m, { gain: 0.07, decay: 0.3, pan: i % 2 ? 0.35 : -0.35, bright: 1.3 }));
  sub(t0, 2, ch[0] - 12, 0.17);
  [0, 1, 2, 3].forEach((b) => kick(t0 + b * B, 0.15));
  [0, 1, 2, 3].forEach((b) => hat(t0 + b * B + 0.25, 0.028));
  [1, 3].forEach((b) => noiseHit(t0 + b * B, 0.07, 0.07, { tone: 0.55, rev: 0.35 })); // clap
  pad(t0, 2, ch.map((m) => m + 12), 0.04, 0.15);
}
// final chord: C major rings out from bar 10 (20s)
pad(20, 1.4, [48, 55, 60, 64, 67], 0.05, 0.12);
sub(20, 1.9, 36, 0.17); kick(20, 0.17);
[72, 76, 79, 84].forEach((m, i) => pluck(20 + i * 0.09, m, { gain: 0.06, decay: 0.8, pan: (i - 1.5) * 0.25 }));

// ---------- sfx (the app's own pitches, in key, under the music) ----------
bell(0.42, 1046, 0.5, 0.05, 0.2); bell(0.6, 784, 0.8, 0.045, 0.2);          // sign flips: sfx.chime
[69, 72, 76, 81].forEach((m, i) => pluck([1.25, 1.5, 1.75, 2.0][i], m, { gain: 0.07, decay: 0.18, pan: -0.5 + i * 0.25, rev: 0.4, bright: 1.6 })); // jars wake
pluck(2.25, 52, { gain: 0.06, decay: 0.2, rev: 0.3 });                       // garlic: low
noiseHit(2.0, 0.03, 0.025, { tone: 0.35, pan: -0.4 });                       // bubble pop
riser(3.3, 0.75, 0.06); boom(4.02, 0.3); bell(4.02, 523, 1.2, 0.035);       // logo
[8.0, 8.5, 9.0, 9.5].forEach((t, i) => bell(t, hz(88 - (i % 2) * 3), 0.08, 0.02, 0.3, 0.3)); // messages land
bell(9.2, 659, 0.15, 0.04, -0.2); bell(9.3, 988, 0.25, 0.035, -0.2);         // approved: sfx.ok
boom(9.75, 0.2); noiseHit(9.75, 0.06, 0.07, { tone: 0.25, rev: 0.25 });      // blocked: stamp thud
noiseHit(11.45, 0.25, 0.035, { tone: 0.08, attack: 0.15, pan: 0.3, rev: 0.4 }); // phone whoosh
noiseHit(12.47, 0.015, 0.04, { tone: 0.5, pan: 0.3 });                       // tap
bell(12.5, 659, 0.15, 0.04, 0.3); bell(12.6, 988, 0.25, 0.035, 0.3);         // approve: sfx.ok
[523, 659, 784, 1046].forEach((f, i) => bell(14.0 + i * 0.18, f, 1.0, 0.04, (i - 1.5) * 0.3, 0.6)); // sfx.sunrise
boom(16.0, 0.16); noiseHit(16.0, 0.05, 0.05, { tone: 0.3 });                 // price stamp
noiseHit(16.5, 0.1, 0.03, { tone: 0.15, attack: 0.04, pan: 0.4 });           // QR drops
bell(16.9, 784, 0.3, 0.03, 0.4); bell(17.02, 1046, 0.5, 0.03, 0.4);          // impact
riser(18.1, 0.55, 0.05); boom(18.65, 0.24);                                  // outro logo

// ---------- reverb send (Schroeder) ----------
function reverb(inp, combs, aps) {
  const out = new Float32Array(N);
  for (const [d, g] of combs) { const buf = new Float32Array(d); let k = 0, lp = 0; for (let i = 0; i < N; i++) { const y = buf[k]; lp = lp * 0.4 + y * 0.6; buf[k] = inp[i] + lp * g; out[i] += y / combs.length; k = (k + 1) % d; } }
  for (const [d, g] of aps) { const buf = new Float32Array(d); let k = 0; for (let i = 0; i < N; i++) { const b = buf[k]; const x = out[i] + b * g; out[i] = b - x * g; buf[k] = x; k = (k + 1) % d; } }
  return out;
}
const rl = reverb(sendL, [[1557, 0.84], [1617, 0.84], [1491, 0.84], [1422, 0.84]], [[225, 0.5], [556, 0.5]]);
const rr = reverb(sendR, [[1580, 0.84], [1640, 0.84], [1514, 0.84], [1445, 0.84]], [[248, 0.5], [579, 0.5]]);
for (let i = 0; i < N; i++) { L[i] += rl[i] * 0.9; R[i] += rr[i] * 0.9; }

// ---------- master: fade, soft clip, normalize ----------
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR, f = Math.min(1, t / 0.02) * (t > 21.2 ? Math.max(0, 1 - (t - 21.2) / 0.8) : 1);
  L[i] = Math.tanh(L[i] * 1.6 * f); R[i] = Math.tanh(R[i] * 1.6 * f);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const g = 0.89 / peak;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(L[i] * g * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(R[i] * g * 32767), 46 + i * 4); }
fs.writeFileSync('audio.wav', buf);
console.log('audio.wav', DUR + 's', 'peak gain', g.toFixed(2));
