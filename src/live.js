import { useEffect, useRef, useState } from 'react';

// Subscribes to the server's live stream. Every update carries the full state,
// plus an optional "fx" event for one-off effects (stamps, sounds, sunrise).
export function useLive(onFx) {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);
  const fxRef = useRef(onFx);
  fxRef.current = onFx;

  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      const { state, fx } = JSON.parse(e.data);
      setState(state);
      if (fx && fxRef.current) fxRef.current(fx, state);
    };
    return () => es.close();
  }, []);
  return { state, connected };
}

export async function api(path, body) {
  const res = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

export async function getJSON(path) {
  const res = await fetch(`/api/${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}
