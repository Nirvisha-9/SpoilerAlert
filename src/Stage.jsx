import { useEffect, useRef, useState } from 'react';
import { useLive, api } from './live.js';
import { glyph } from './ingredients.js';
import { sfx } from './sfx.js';
import MenuCard from './MenuCard.jsx';

const LOOP = new URLSearchParams(window.location.search).has('loop');
const NIGHT = ['open', 'closing', 'pantry', 'huddle', 'chef'];

export default function Stage() {
  const [stamp, setStamp] = useState(null);
  const [error, setError] = useState('');
  const { state, connected } = useLive((fx) => {
    if (fx.type === 'blocked') { sfx.stamp(); setStamp(fx.id); }
    if (fx.type === 'approved') sfx.ok();
    if (fx.type === 'sunrise') sfx.sunrise();
    if (fx.type === 'order') sfx.ticket();
  });

  const start = async () => {
    setError('');
    sfx.chime();
    try { await api('night/start', { auto: LOOP }); } catch (e) { setError(e.message); }
  };
  const reset = () => api('reset').catch((e) => setError(e.message));

  // Keyboard: space closes the shop, R resets. Handy on stage.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space' && state?.phase === 'open') { e.preventDefault(); start(); }
      if (e.key === 'r' || e.key === 'R') reset();
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
        {state.phase === 'open' && <button className="btn btn--primary" onClick={start}>Close the shop</button>}
        {state.phase !== 'open' && !LOOP && <button className="btn btn--ghost" onClick={reset}>Start over</button>}
      </header>
      {error && <p className="toast" role="alert">{error}</p>}

      {night ? (
        <div className="night">
          <Stockroom state={state} />
          <Huddle messages={state.messages} stamp={stamp} />
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
      <p className="phone__app">WhatsApp · Spoiler Alert</p>
      <p className="phone__bubble">Chef, these passed the critic. Which one goes on tomorrow's board?</p>
      {ready.map((p) => (
        <div className="phone__option" key={p.id}>
          <strong>{p.name}</strong>
          <span>${p.price.toFixed(2)} · {p.review.foodCostPct}% food cost</span>
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
