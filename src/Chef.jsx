import { useState } from 'react';
import { useLive, api } from './live.js';
import MenuCard from './MenuCard.jsx';

// The chef's phone. A stand-in for WhatsApp until ZooWork's WhatsApp delivery is wired.
export default function Chef() {
  const { state } = useLive();
  const [notes, setNotes] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  if (!state) return <main className="mobile"><p>Connecting…</p></main>;
  const ready = state.proposals.filter((p) => p.review?.approved);
  const forChef = state.messages.filter((m) => ['@chef-assistant', '@margin-critic', 'Chef'].includes(m.from)).slice(-6);

  const act = async (path, id) => {
    setError(''); setBusy(id + path);
    try { await api(path, { id, note: notes[id] || '' }); } catch (e) { setError(e.message); }
    setBusy('');
  };

  return (
    <main className="mobile chat">
      <header className="chat__head">
        <span className="chat__avatar" aria-hidden="true">🍕</span>
        <div><strong>Spoiler Alert</strong><span>{state.phase === 'chef' ? 'needs your call' : 'kitchen agent'}</span></div>
      </header>
      <ol className="chat__log">
        {forChef.map((m) => (
          <li key={m.id} className={`chat__msg ${m.from === 'Chef' ? 'chat__msg--me' : ''}`}>{m.text}</li>
        ))}
        {state.phase === 'open' && <li className="chat__msg">Nothing yet. I'll message you at closing time.</li>}
      </ol>

      {state.phase === 'chef' && ready.map((p) => (
        <section className="chat__card" key={p.id}>
          <strong>{p.name}</strong>
          <p>{p.description}</p>
          <p className="chat__meta">${p.price.toFixed(2)}, {p.review.foodCostPct}% food cost. Uses {p.rescues.join(', ').toLowerCase()}.</p>
          <label className="chat__label" htmlFor={`note-${p.id}`}>Add a twist (optional)</label>
          <input id={`note-${p.id}`} placeholder="Make it spicy" value={notes[p.id] || ''} onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })} />
          <div className="chat__actions">
            <button className="btn btn--primary" disabled={!!busy} onClick={() => act('approve', p.id)}>{busy === p.id + 'approve' ? 'Approving…' : 'Approve'}</button>
            <button className="btn btn--ghost" disabled={!!busy} onClick={() => act('pass', p.id)}>Pass</button>
          </div>
        </section>
      ))}
      {state.special && <div className="chat__preview"><MenuCard card={state.special} compact /></div>}
      {error && <p className="toast" role="alert">{error}</p>}
    </main>
  );
}
