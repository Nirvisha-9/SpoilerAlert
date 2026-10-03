import { useEffect, useRef, useState } from 'react';
import { useLive, api, getJSON } from './live.js';
import { glyph } from './ingredients.js';
import { sfx } from './sfx.js';
import * as voice from './voice.js';
import MenuCard from './MenuCard.jsx';

const LOOP = new URLSearchParams(window.location.search).has('loop');
const isTyping = (el) => Boolean(el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable));
const NIGHT = ['open', 'closing', 'pantry', 'huddle', 'chef'];

export default function Stage() {
  const [stamp, setStamp] = useState(null);
  const [error, setError] = useState('');
  const [inventory, setInventory] = useState(null); // tonight's count from /api/inventory
  const [pending, setPending] = useState({});       // unsaved edits: name -> { stock?, daysLeft? } as typed
  const [fieldErrors, setFieldErrors] = useState({}); // "name|field" -> message
  const [saving, setSaving] = useState(false);
  const [sound, setSound] = useState(true);
  const [unlocked, setUnlocked] = useState(voice.isUnlocked());
  const spokenUpTo = useRef(null); // id of the last room message handed to the voice
  const { state, connected } = useLive((fx, st) => {
    if (fx.type === 'blocked') { sfx.stamp(); setStamp(fx.id); }
    if (fx.type === 'approved') sfx.ok();
    if (fx.type === 'sunrise') sfx.sunrise();
    if (fx.type === 'order') sfx.ticket();
    if (fx.type === 'card') voice.speakSunrise(st.special);
  });

  // Voice-over: speak each new room message once. Messages already on screen when the page loads stay quiet.
  useEffect(() => {
    const messages = state?.messages;
    if (!messages) return;
    if (messages.length === 0) { if (spokenUpTo.current) voice.reset(); spokenUpTo.current = 0; return; }
    const last = messages.at(-1).id;
    if (spokenUpTo.current === null) { spokenUpTo.current = last; return; }
    for (const m of messages) if (m.id > spokenUpTo.current) voice.speakMessage(m);
    spokenUpTo.current = last;
  }, [state?.messages]);

  // Browsers only allow speech after the first click or key press.
  useEffect(() => {
    if (unlocked) return;
    const onFirst = () => { voice.unlock(); setUnlocked(true); };
    window.addEventListener('pointerdown', onFirst, { once: true });
    window.addEventListener('keydown', onFirst, { once: true });
    return () => { window.removeEventListener('pointerdown', onFirst); window.removeEventListener('keydown', onFirst); };
  }, [unlocked]);

  const toggleSound = () => setSound((on) => !on);
  useEffect(() => { voice.setEnabled(sound); }, [sound]);

  // Load the count whenever a new night opens (first load, or after Start over).
  useEffect(() => {
    if (state?.phase !== 'open') return;
    getJSON('inventory').then((inv) => { setInventory(inv); setPending({}); setFieldErrors({}); }).catch((e) => setError(e.message));
  }, [state?.phase, state?.seed, state?.date]);

  // Saves unsaved edits. Returns false (and shows why) if anything is invalid.
  const saveCount = async () => {
    const items = Object.entries(pending).map(([name, v]) => ({ name, ...v }));
    if (!items.length) return true;
    const errs = checkEdits(items);
    setFieldErrors(errs);
    if (Object.keys(errs).length) { setError('Fix the highlighted counts first.'); return false; }
    setSaving(true);
    try {
      setInventory(await api('inventory', { items }));
      setPending({});
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally { setSaving(false); }
  };

  const start = async () => {
    setError('');
    if (!(await saveCount())) return; // the agents run on the edited count
    sfx.chime();
    try { await api('night/start', { auto: LOOP }); } catch (e) { setError(e.message); }
  };
  const reset = () => api('reset').catch((e) => setError(e.message));

  // Keyboard: space closes the shop, R resets, V turns the voice on or off. Handy on stage.
  useEffect(() => {
    const onKey = (e) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space' && state?.phase === 'open') { e.preventDefault(); start(); }
      if (e.key === 'r' || e.key === 'R') reset();
      if (e.key === 'v' || e.key === 'V') toggleSound();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Booth loop for the gallery walk: run, auto-approve, hold the card, start over.
  useEffect(() => {
    if (!LOOP || !state) return;
    if (state.phase === 'open') { const t = setTimeout(start, 4000); return () => clearTimeout(t); }
    if (state.phase === 'sunrise') { const t = setTimeout(reset, 60000); return () => clearTimeout(t); }
  }, [state?.phase]);

  if (!state) return <main className="stage stage--loading"><p>{connected ? 'Loading…' : 'Connecting to the kitchen…'}</p></main>;
  const night = NIGHT.includes(state.phase);

  return (
    <main className={`stage ${night ? 'is-night' : 'is-dawn'} phase-${state.phase}`}>
      <header className="topbar">
        <h1 className="logo">Spoiler Alert</h1>
        <p className="topbar__status">{statusLine(state)}</p>
        {voice.isSupported() && (
          <button className="btn btn--ghost btn--small sound" aria-pressed={sound} onClick={toggleSound} title="Voice on or off (V)">
            {sound ? 'Sound on' : 'Sound off'}
          </button>
        )}
        {state.phase === 'open' && <button className="btn btn--primary" onClick={start}>Close the shop</button>}
        {state.phase !== 'open' && !LOOP && <button className="btn btn--ghost" onClick={reset}>Start over</button>}
      </header>
      {error && <p className="toast" role="alert">{error}</p>}
      {LOOP && sound && !unlocked && voice.isSupported() && <p className="soundnote">Click anywhere for sound</p>}

      {night ? (
        <div className="night">
          <Stockroom state={state} />
          {state.phase === 'open' && !LOOP
            ? <ClosingCount inventory={inventory} pending={pending} setPending={setPending} errors={fieldErrors} setErrors={setFieldErrors} onSave={async () => { setError(''); await saveCount(); }} saving={saving} />
            : <Huddle messages={state.messages} stamp={stamp} />}
          {state.phase === 'chef' && <ChefPhone proposals={state.proposals} onError={setError} />}
        </div>
      ) : (
        <div className="dawn">
          {state.special ? <MenuCard card={state.special} build /> : <div className="board board--pending"><p>Plating the special…</p></div>}
          <aside className="dawn__side">
            {state.impact && <Impact impact={state.impact} />}
            <Tickets orders={state.orders} />
          </aside>
        </div>
      )}
      <p className="datanote">
        Menu: real (Tandoori Pizza, San Jose). Sales patterns: real (Maven Analytics). Stock and expiry: simulated with USDA shelf-life rules.
      </p>
    </main>
  );
}

function statusLine(s) {
  const day = s.date === 'tonight' ? 'tonight' : new Date(s.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  return {
    open: `Open for business, ${day}`,
    closing: 'Closing up',
    pantry: 'The stockroom is awake',
    huddle: 'The agents are talking it over',
    chef: 'Waiting for Chef',
    sunrise: 'Good morning',
  }[s.phase];
}

function Stockroom({ state }) {
  const latest = {};
  for (const m of state.messages) latest[m.from] = m.text;
  const rows = [state.shelf.slice(0, 5), state.shelf.slice(5, 10), state.shelf.slice(10, 15)];
  return (
    <section className="stockroom" aria-label="Stockroom shelf">
      <div className={`sign ${state.phase === 'open' ? '' : 'sign--closed'}`} aria-hidden="true">
        <span className="sign__face sign__face--open">Open</span>
        <span className="sign__face sign__face--closed">Closed</span>
      </div>
      {rows.map((row, r) => (
        <div className="shelf" key={r}>
          {row.map((item) => (
            <div className={`jar jar--${item.status}`} key={item.name}>
              <span className="jar__glyph" aria-hidden="true">{glyph(item.name)}</span>
              <span className="jar__name">{item.name}</span>
              {item.status === 'asleep' && <span className="jar__zz" aria-hidden="true">z z</span>}
              {(item.status === 'expiring' || item.status === 'low') && latest[item.name] && (
                <p className="jar__bubble">{latest[item.name].replace(`${item.name}: `, '')}</p>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

// Same limits as the server, so mistakes show up before saving.
function checkEdits(items) {
  const errs = {};
  for (const it of items) {
    if (it.stock !== undefined && (it.stock === '' || !(Number(it.stock) >= 0))) errs[`${it.name}|stock`] = 'Stock must be 0 or more grams.';
    if (it.daysLeft !== undefined) {
      const d = Number(it.daysLeft);
      if (it.daysLeft === '' || !Number.isInteger(d) || d < 0 || d > 30) errs[`${it.name}|daysLeft`] = 'Days left must be a whole number from 0 to 30.';
    }
  }
  return errs;
}

const STATUS_LABEL = { expiring: 'Expires soon', low: 'Low', ok: 'OK' };

function ClosingCount({ inventory, pending, setPending, errors, setErrors, onSave, saving }) {
  const [query, setQuery] = useState('');
  if (!inventory) return <section className="count" aria-label="Closing count"><h2 className="count__title">Closing count</h2><p className="count__hint">Loading tonight's stock…</p></section>;
  const edit = (name, field, value) => {
    setPending((p) => ({ ...p, [name]: { ...p[name], [field]: value } }));
    setErrors((e) => { const n = { ...e }; delete n[`${name}|${field}`]; return n; });
  };
  const q = query.trim().toLowerCase();
  const rows = [...inventory.items].sort((a, b) => a.name.localeCompare(b.name)).filter((i) => !q || i.name.toLowerCase().includes(q));
  const unsaved = Object.keys(pending).length;
  return (
    <section className="count" aria-label="Closing count">
      <div className="count__head">
        <h2 className="count__title">Closing count</h2>
        <button className="btn btn--small btn--primary" onClick={onSave} disabled={!unsaved || saving}>{saving ? 'Saving…' : unsaved ? `Save ${unsaved} change${unsaved > 1 ? 's' : ''}` : 'Saved'}</button>
      </div>
      <p className="count__hint">Correct tonight's stock before you close. The agents use this count.</p>
      <label className="count__search">
        <span className="sr-only">Find an ingredient</span>
        <input type="search" placeholder="Find an ingredient" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <table className="count__table">
        <thead><tr><th scope="col">Ingredient</th><th scope="col">Stock (g)</th><th scope="col">Days left</th><th scope="col">Status</th></tr></thead>
        <tbody>
          {rows.map((i) => {
            const p = pending[i.name] || {};
            const stockErr = errors[`${i.name}|stock`];
            const daysErr = errors[`${i.name}|daysLeft`];
            const id = i.name.replace(/\W+/g, '-').toLowerCase();
            return (
              <tr key={i.name} className={pending[i.name] ? 'is-unsaved' : ''}>
                <th scope="row">{i.name}</th>
                <td>
                  <input id={`stock-${id}`} type="number" inputMode="numeric" min="0" step="10" aria-label={`${i.name} stock in grams`}
                    aria-invalid={Boolean(stockErr)} aria-describedby={stockErr ? `stock-${id}-err` : undefined}
                    value={p.stock ?? i.stock} onChange={(e) => edit(i.name, 'stock', e.target.value)} />
                  {stockErr && <span className="field-error" id={`stock-${id}-err`}>{stockErr}</span>}
                </td>
                <td>
                  <input id={`days-${id}`} type="number" inputMode="numeric" min="0" max="30" step="1" aria-label={`${i.name} days until expiry`}
                    aria-invalid={Boolean(daysErr)} aria-describedby={daysErr ? `days-${id}-err` : undefined}
                    value={p.daysLeft ?? i.daysLeft} onChange={(e) => edit(i.name, 'daysLeft', e.target.value)} />
                  {daysErr && <span className="field-error" id={`days-${id}-err`}>{daysErr}</span>}
                </td>
                <td><span className={`count__status count__status--${i.status}`}>{pending[i.name] ? 'Unsaved' : STATUS_LABEL[i.status]}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

const WHO = {
  '@pantry': 'pantry', '@chef-assistant': 'chef-assistant', '@margin-critic': 'critic', Chef: 'chef',
};

function Huddle({ messages, stamp }) {
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length]);
  return (
    <section className="huddle" aria-label="Agent room" aria-live="polite">
      <h2 className="huddle__title">The room</h2>
      {messages.length === 0 && <p className="huddle__empty">The agents wake up when you close the shop.</p>}
      <ol className="feed">
        {messages.map((m) => (
          <li key={m.id} className={`msg msg--${WHO[m.from] || 'ingredient'} msg--${m.kind}`}>
            <span className="msg__from">{WHO[m.from] ? m.from : `${glyph(m.from)} ${m.from}`}</span>
            <span className="msg__text">{m.text.replace(`${m.from}: `, '')}</span>
            {m.kind === 'blocked' && <span className="msg__stamp msg__stamp--blocked" aria-hidden="true">Blocked</span>}
            {m.kind === 'approved' && <span className="msg__stamp msg__stamp--ok" aria-hidden="true">Approved</span>}
          </li>
        ))}
      </ol>
      <div ref={end} />
    </section>
  );
}

function ChefPhone({ proposals, onError }) {
  const ready = proposals.filter((p) => p.review?.approved);
  const approve = (id) => api('approve', { id }).catch((e) => onError(e.message));
  return (
    <aside className="phone" aria-label="Chef's phone">
      <p className="phone__app">Chef's phone</p>
      <p className="phone__bubble">Chef, these passed the critic. Which one goes on tomorrow's board?</p>
      {ready.map((p) => (
        <div className="phone__option" key={p.id}>
          <strong>{p.name}</strong>
          <span>${p.price.toFixed(2)} · ${p.review.profit.toFixed(2)} profit per {p.review.unit || 'pizza'}</span>
          <button className="btn btn--small" onClick={() => approve(p.id)}>Approve</button>
        </div>
      ))}
      <p className="phone__hint">Or reply from your phone at /chef</p>
    </aside>
  );
}

const kg = (g) => (g >= 1000 ? `${(g / 1000).toFixed(1)} kg` : `${Math.round(g)} g`);

function Impact({ impact }) {
  return (
    <section className="impact" aria-label="Impact">
      <p className="impact__big">${impact.savedTonight}</p>
      <p className="impact__label">of stock rescued tonight ({kg(impact.grams)} of food, out of ${impact.atRisk} at risk)</p>
      <p className="impact__month">About ${impact.perMonth.toLocaleString()} a month if every night looks like this</p>
    </section>
  );
}

function Tickets({ orders }) {
  return (
    <section className="tickets" aria-label="Incoming orders" aria-live="polite">
      <h2 className="tickets__title">{orders.length ? `${orders.length} order${orders.length > 1 ? 's' : ''} in` : 'Orders print here'}</h2>
      <ol className="rail">
        {[...orders].reverse().slice(0, 8).map((o) => (
          <li className="ticket" key={o.id}>
            <span className="ticket__no">#{o.id}</span>
            <span className="ticket__name">{o.name}</span>
            <span className="ticket__item">{o.item}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
