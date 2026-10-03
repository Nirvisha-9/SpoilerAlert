import { useState } from 'react';
import { useLive, api } from './live.js';
import MenuCard from './MenuCard.jsx';

// What the audience sees after scanning the QR code.
export default function Order() {
  const { state } = useLive();
  const [name, setName] = useState('');
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');

  if (!state) return <main className="mobile"><p>Connecting…</p></main>;
  if (!state.special) return <main className="mobile order"><h1 className="logo">Spoiler Alert</h1><p>Tonight's special isn't on the board yet. Keep this page open.</p></main>;

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Enter your name so we can call your order.'); return; }
    setError('');
    try { setDone(await api('orders', { name: name.trim() })); } catch (err) { setError(err.message); }
  };

  return (
    <main className="mobile order">
      <h1 className="logo logo--small">Spoiler Alert</h1>
      <MenuCard card={state.special} compact />
      {done ? (
        <p className="order__done">Order #{done.id} is in, {done.name}. Look up at the screen.</p>
      ) : (
        <form onSubmit={submit} className="order__form" noValidate>
          <label htmlFor="name">Your name</label>
          <input id="name" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="Priya" autoComplete="given-name" />
          {error && <p className="field-error">{error}</p>}
          <button className="btn btn--primary" type="submit">Order this special</button>
          <p className="order__note">Demo order. No payment is taken.</p>
        </form>
      )}
    </main>
  );
}
