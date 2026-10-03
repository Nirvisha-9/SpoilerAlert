// Builds the finished menu card: photo, copy, price, QR, plus structured data for shopper agents.
import QRCode from 'qrcode';
import { generateDishImage, zooworkOn } from './zoowork.js';

const TOPPING_COLORS = {
  poultry: '#E9C38A', meat: '#B8402F', herb: '#3E8E41', veg: '#D9472B', cheese: '#F6E7B0',
  fruit: '#F4C430', seafood: '#F28C6B', sauce: '#B23A2A', base: '#E0A458', pantry: '#8C6A43',
};

// Fallback "photo": an illustrated top-down pizza in the special's own toppings.
function illustratedPizza(special, inventory) {
  const kinds = special.ingredients.map((n) => inventory.find((i) => i.name === n)?.kind || 'veg');
  let seed = special.name.length * 97;
  const r = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const dots = Array.from({ length: 46 }, (_, i) => {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 118;
    const c = TOPPING_COLORS[kinds[i % kinds.length]] || '#D9472B';
    const size = 7 + r() * 9;
    return `<ellipse cx="${200 + Math.cos(a) * d}" cy="${200 + Math.sin(a) * d}" rx="${size}" ry="${size * 0.75}" fill="${c}" transform="rotate(${r() * 180} ${200 + Math.cos(a) * d} ${200 + Math.sin(a) * d})"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
<rect width="400" height="400" fill="#5B3A22"/>
<circle cx="200" cy="200" r="172" fill="#E0A458"/>
<circle cx="200" cy="200" r="150" fill="#C8432D"/>
<circle cx="200" cy="200" r="142" fill="#F3D9A4" opacity="0.92"/>
${dots}
<path d="M200 200 L352 200 A152 152 0 0 1 331 277 Z" fill="#5B3A22" opacity="0.18"/>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export async function buildMenuCard(special, inventory) {
  const prompt = `Overhead food photo of a pizza: ${special.description} Toppings: ${special.ingredients.join(', ')}. Rustic wooden table, warm restaurant light, shallow depth of field, appetizing, no text, no logos.`;
  let image = null;
  if (zooworkOn()) {
    try {
      image = await Promise.race([
        generateDishImage(prompt),
        new Promise((_, rej) => setTimeout(() => rej(new Error('image timeout')), 20000)),
      ]);
    } catch (e) {
      console.warn('[menu-card] image fallback:', e.message);
    }
  }
  const orderUrl = `${(process.env.PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '')}/order`;
  const qr = await QRCode.toDataURL(orderUrl, { margin: 1, width: 360, color: { dark: '#1F2A24', light: '#F4EEDC' } });
  return {
    ...special,
    image: image || illustratedPizza(special, inventory),
    imageSource: image ? 'zoowork' : 'illustration',
    orderUrl,
    qr,
    // Machine-readable version so shopper agents can find tonight's special too.
    structured: {
      '@context': 'https://schema.org',
      '@type': 'MenuItem',
      name: special.name,
      description: special.description,
      offers: { '@type': 'Offer', price: special.price.toFixed(2), priceCurrency: 'USD', availability: 'https://schema.org/LimitedAvailability' },
      url: orderUrl,
    },
  };
}
