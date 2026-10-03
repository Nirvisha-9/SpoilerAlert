import { useEffect, useState } from 'react';

function useTypewriter(text, active, speed = 55) {
  const [n, setN] = useState(active ? 0 : text.length);
  useEffect(() => {
    if (!active) { setN(text.length); return; }
    setN(0);
    const id = setInterval(() => setN((v) => (v >= text.length ? (clearInterval(id), v) : v + 1)), speed);
    return () => clearInterval(id);
  }, [text, active, speed]);
  return text.slice(0, n);
}

// The chalkboard menu board. `build` plays the reveal: photo develops, name types, price stamps, QR drops.
export default function MenuCard({ card, build = false, compact = false }) {
  const name = useTypewriter(card.name, build);
  return (
    <article className={`board ${build ? 'board--build' : ''} ${compact ? 'board--compact' : ''}`} aria-label={`Tonight's special: ${card.name}`}>
      <p className="board__kicker">Tonight only</p>
      <div className="board__body">
        <figure className="board__photo">
          <img src={card.image} alt={`${card.name}, top-down view`} />
        </figure>
        <div className="board__text">
          <h2 className="board__name">{name}<span className="board__caret" aria-hidden="true" /></h2>
          <p className="board__desc">{card.description}</p>
          <div className="board__foot">
            <p className="board__price">${card.price.toFixed(2)}</p>
            {!compact && (
              <div className="board__qr">
                <img src={card.qr} alt="QR code to order tonight's special" />
                <span>Scan to order</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
