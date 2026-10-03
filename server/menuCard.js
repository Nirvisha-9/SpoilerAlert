// Builds the finished menu card: photo, copy, price, QR, plus structured data for shopper agents.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { generateDishImage, cloudflareOn, imageType } from './cloudflare.js';

const PHOTO_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'photos');
const PHOTO_TIMEOUT_MS = 20_000;
const PHOTO_EXTS = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

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

// One photo per recipe, so a special reuses its recipe's photo on later nights.
const safeId = (id) => (/^[a-z0-9_-]+$/i.test(id || '') ? id : null);

function cachedPhoto(recipeId) {
  const id = safeId(recipeId);
  if (!id) return null;
  for (const [ext, mime] of Object.entries(PHOTO_EXTS)) {
    const file = path.join(PHOTO_DIR, `${id}.${ext}`);
    if (fs.existsSync(file)) return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  }
  return null;
}

// Saved under the image's real format: FLUX.1 schnell returns JPEG, so this is usually <recipeId>.jpg.
function savePhoto(recipeId, dataUrl) {
  const id = safeId(recipeId);
  if (!id) return;
  const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  const type = imageType(buf);
  if (!type) return;
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  fs.writeFileSync(path.join(PHOTO_DIR, `${id}.${type.ext}`), buf);
}

const plainName = (name) => name.replace(/^The\s+/i, '').replace(/\s+Pizza$/i, '');

export function photoPrompt(dishName, toppings, isPizza = true) {
  const dish = isPizza ? `${plainName(dishName)} pizza` : dishName;
  const list = toppings.map((t) => t.toLowerCase());
  const withToppings = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0] || 'mozzarella';
  return `Professional overhead food photography of ${dish} with ${withToppings}, on a rustic wooden table, warm natural restaurant light, shallow depth of field, natural colors, appetizing, no text, no logos.`;
}

export async function buildMenuCard(special, inventory, menu = []) {
  const recipe = menu.find((m) => m.id === special.recipeId);
  const isPizza = (recipe?.section || 'pizza') === 'pizza';
  const toppings = special.ingredients.filter((x) => x !== 'Pizza Dough');

  // 1. A photo we already made for this recipe. 2. A live photo, if it arrives within 20 s. 3. The illustration.
  let image = cachedPhoto(special.recipeId);
  let imageSource = image ? 'cached' : 'illustration';
  if (!image && cloudflareOn()) {
    const started = Date.now();
    const generating = generateDishImage(photoPrompt(recipe?.name || special.name, toppings, isPizza));
    // Cache it even if it lands after the timeout, so the next night gets it.
    generating.then((url) => savePhoto(special.recipeId, url), () => {});
    try {
      image = await Promise.race([
        generating,
        new Promise((_, rej) => setTimeout(() => rej(new Error(`image took longer than ${PHOTO_TIMEOUT_MS / 1000}s`)), PHOTO_TIMEOUT_MS)),
      ]);
      imageSource = 'flux';
      console.log(`[menu-card] photo generated in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } catch (e) {
      console.warn('[menu-card] image fallback:', e.message);
    }
  }
  const orderUrl = `${(process.env.PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '')}/order`;
  const qr = await QRCode.toDataURL(orderUrl, { margin: 1, width: 360, color: { dark: '#1F2A24', light: '#F4EEDC' } });
  return {
    ...special,
    image: image || illustratedPizza(special, inventory),
    imageSource,
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
