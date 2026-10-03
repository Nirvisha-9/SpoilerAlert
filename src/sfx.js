// Tiny synthesized sound effects (no audio files). They start after the first click.
let ctx;
const ac = () => (ctx ??= new (window.AudioContext || window.webkitAudioContext)());

function tone(freq, start, dur, type = 'sine', gain = 0.18) {
  const c = ac(), o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start); o.stop(c.currentTime + start + dur + 0.05);
}

export const sfx = {
  chime() { try { tone(1046, 0, 0.6); tone(784, 0.18, 0.9); } catch {} },
  stamp() { try { tone(90, 0, 0.25, 'square', 0.25); tone(60, 0.02, 0.3, 'sine', 0.3); } catch {} },
  ok() { try { tone(660, 0, 0.15, 'triangle'); tone(990, 0.1, 0.25, 'triangle'); } catch {} },
  ticket() { try { for (let i = 0; i < 6; i++) tone(1800 + i * 40, i * 0.04, 0.03, 'square', 0.05); } catch {} },
  sunrise() { try { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.18, 1.2, 'sine', 0.1)); } catch {} },
};
