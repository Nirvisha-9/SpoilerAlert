// Hands-free listening with Chrome's Web Speech API (continuous recognition).
// Chrome ends recognition on its own after silences and timeouts, so we restart it while wanted.
// pause()/resume() let the stage stop listening while our own voice-over is speaking.

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const FATAL = { 'not-allowed': 'Microphone access was blocked.', 'service-not-allowed': 'Speech recognition is not allowed in this browser.', 'audio-capture': 'No microphone was found.' };

export const listeningSupported = () => Boolean(Recognition);

/**
 * @param {{ onInterim(text), onFinal(text), onStatus(status), onFail(message) }} handlers
 *   status: 'listening' | 'paused' | 'off'
 */
export function createListener({ onInterim, onFinal, onStatus, onFail }) {
  if (!Recognition) return null;
  const rec = new Recognition();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';
  rec.maxAlternatives = 1;

  let wanted = false;   // should we be listening at all
  let paused = false;   // voice-over is speaking
  let running = false;
  let quickEnds = 0;    // ends within a second of starting, in a row
  let startedAt = 0;
  let restartTimer = null;

  const status = () => onStatus?.(!wanted ? 'off' : paused ? 'paused' : 'listening');

  function tryStart() {
    clearTimeout(restartTimer);
    if (!wanted || paused || running) return;
    try {
      rec.start();
      running = true;
      startedAt = Date.now();
    } catch {
      // start() throws if Chrome still thinks it's running; try again shortly
      restartTimer = setTimeout(tryStart, 300);
    }
  }

  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) { const text = r[0].transcript.trim(); if (text) onFinal?.(text); }
      else interim += r[0].transcript;
    }
    if (interim.trim()) onInterim?.(interim.trim());
  };

  rec.onerror = (e) => {
    if (FATAL[e.error]) { wanted = false; running = false; status(); onFail?.(FATAL[e.error]); }
    // 'no-speech', 'aborted' and 'network' end the session; onend restarts it.
  };

  rec.onend = () => {
    running = false;
    if (!wanted || paused) return;
    quickEnds = Date.now() - startedAt < 1000 ? quickEnds + 1 : 0;
    if (quickEnds >= 5) { wanted = false; status(); onFail?.('Speech recognition keeps stopping.'); return; }
    restartTimer = setTimeout(tryStart, 250);
  };

  return {
    start() { wanted = true; quickEnds = 0; status(); tryStart(); },
    stop() { wanted = false; clearTimeout(restartTimer); if (running) rec.abort(); running = false; status(); },
    pause() {
      if (paused) return;
      paused = true; clearTimeout(restartTimer);
      if (running) rec.abort(); // abort, not stop: drop anything half-heard
      running = false; status();
    },
    resume() { if (!paused) return; paused = false; status(); tryStart(); },
  };
}
