// Builds tonight's closing-time snapshot: menu, today's sales, and inventory.
// Real: the menu (Tandoori Pizza, San Jose) in data/restaurant-menu.json, and sales patterns
// (which categories sell on which weekday and hour) from Maven "Pizza Place Sales".
// Simulated (and we say so on stage): delivery dates, stock levels, unit costs.
// Expiry = simulated delivery date + USDA FoodKeeper refrigerated shelf life (data/shelf-life.json).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseCSV } from './csv.js';
import { SEED_MENU } from './seed.js';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const read = (f) => {
  const p = path.join(DATA_DIR, f);
  // Maven's pizza_types.csv is Latin-1 encoded, so read everything as latin1.
  return fs.existsSync(p) ? parseCSV(fs.readFileSync(p, 'latin1')) : null;
};
const readJSON = (f) => {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch { return null; }
};

// Seeded randomness: same seed, same night.
function rng(seed = 42) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// NIGHT_SEED in .env pins the night for rehearsals; otherwise every night is new.
export function nightSeed() {
  const fixed = process.env.NIGHT_SEED?.trim();
  if (fixed) {
    const n = /^\d+$/.test(fixed) ? Number(fixed) : [...fixed].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
    return { seed: n, label: fixed, fixed: true };
  }
  const n = crypto.randomInt(1, 1_000_000);
  return { seed: n, label: String(n), fixed: false };
}

const DAY = 86_400_000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (isoDate, n) => iso(new Date(Date.parse(isoDate + 'T12:00:00Z') + n * DAY));
const weekdayOf = (isoDate) => new Date(isoDate + 'T12:00:00Z').getUTCDay();
const normDate = (d) => {
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : d;
};

export const fmtQty = (g) => (g >= 1000 ? `${(g / 1000).toFixed(1)} kg` : `${Math.round(g)} g`);

// Fallback shelf life (days) and cost (USD per kg) for ingredients missing from the JSON files,
// e.g. when the built-in sample menu is running.
const KINDS = [
  { kind: 'seafood', match: /shrimp|anchov|tuna|clam/i, shelf: 2, cost: 30 },
  { kind: 'poultry', match: /chicken/i, shelf: 4, cost: 13 },
  { kind: 'meat', match: /pepperoni|salami|ham|bacon|sausage|chorizo|prosciutto|beef|lamb|meat|capocollo|soppressata|pancetta|calabrese|'nduja|nduja/i, shelf: 7, cost: 14 },
  { kind: 'herb', match: /cilantro|basil|arugula|spinach|thyme|oregano|rosemary|greens|lettuce/i, shelf: 7, cost: 14 },
  { kind: 'cheese', match: /cheese|mozzarella|paneer|feta|gouda|brie|ricotta|parmigiano|parmesan|asiago|fontina|provolone|romano|gorgonzola/i, shelf: 14, cost: 10 },
  { kind: 'sauce', match: /sauce|pesto|alfredo|dressing|marinade/i, shelf: 5, cost: 5 },
  { kind: 'fruit', match: /pineapple|pear|avocado|fig|berr|pomegranate/i, shelf: 5, cost: 6 },
  { kind: 'veg', match: /.*/, shelf: 7, cost: 4 },
];
export const kindOf = (name) => KINDS.find((k) => k.match.test(name));
const SAMPLE_GRAMS = 60; // portion per ingredient when a recipe has no grams (sample menu)

// ---------- menu ----------
export function loadMenu() {
  const real = readJSON('restaurant-menu.json');
  if (real?.items?.length) {
    const menu = real.items
      .filter((it) => it.price > 0)
      .map((it) => ({
        id: it.id,
        name: it.name,
        section: it.section,
        category: it.mavenCategory,
        mavenClosest: it.mavenClosest,
        price: it.price,
        priceSource: it.priceSource,
        ingredients: it.ingredients.map((i) => i.name),
        grams: Object.fromEntries(it.ingredients.map((i) => [i.name, i.grams])),
        approximate: Boolean(it.approximate),
      }));
    return { menu, source: 'restaurant', restaurant: real.restaurant };
  }
  return { menu: SEED_MENU.map((m) => ({ ...m, section: 'pizza' })), source: 'sample', restaurant: null };
}

function loadIngredientInfo() {
  const shelf = readJSON('shelf-life.json')?.ingredients || {};
  const costs = readJSON('unit-costs.json')?.costPerKg || {};
  return (name) => {
    const s = shelf[name];
    const k = kindOf(name);
    return {
      kind: s?.kind || k.kind,
      storage: s?.storage || 'fridge',
      shelfDays: s?.maxDays ?? k.shelf,
      foodkeeper: s?.foodkeeper || null,
      proxy: s?.proxy || null,
      costPerKg: costs[name] ?? k.cost,
    };
  };
}

// ---------- sales patterns (Maven Analytics "Pizza Place Sales", 2015) ----------
// Published totals from the dataset, used when the CSVs are not in /data:
// 21,350 orders, 49,574 pizzas over 358 trading days.
const MAVEN_SUMMARY = {
  pizzasByCategory: { Classic: 14888, Supreme: 11987, Veggie: 11649, Chicken: 11050 },
  ordersByWeekday: [2624, 2794, 2973, 3024, 3239, 3538, 3158], // Sun..Sat
  ordersByHour: { 9: 1, 10: 8, 11: 1231, 12: 2520, 13: 2455, 14: 1472, 15: 1468, 16: 1920, 17: 2336, 18: 2399, 19: 2009, 20: 1642, 21: 1198, 22: 663, 23: 28 },
  orders: 21350, pizzas: 49574, days: 358,
};

function loadPattern() {
  const orders = read('orders.csv');
  const details = read('order_details.csv');
  const sizes = read('pizzas.csv');
  const types = read('pizza_types.csv');
  if (orders && details && sizes && types) {
    const catOfType = Object.fromEntries(types.map((t) => [t.pizza_type_id, t.category]));
    const catOfPizza = Object.fromEntries(sizes.map((s) => [s.pizza_id, catOfType[s.pizza_type_id]]));
    const orderInfo = Object.fromEntries(orders.map((o) => [o.order_id, { date: normDate(o.date), hour: Number(o.time.slice(0, 2)) }]));
    const byDate = {}; // date -> { qty: {cat: n}, orders: Set }
    const hours = {};
    for (const d of details) {
      const o = orderInfo[d.order_id];
      const cat = catOfPizza[d.pizza_id];
      if (!o || !cat) continue;
      const q = Number(d.quantity) || 1;
      byDate[o.date] ??= { qty: {}, orders: new Set() };
      byDate[o.date].qty[cat] = (byDate[o.date].qty[cat] || 0) + q;
      byDate[o.date].orders.add(d.order_id);
      hours[o.hour] = (hours[o.hour] || 0) + q;
    }
    const dates = Object.keys(byDate).sort();
    const perWeekday = Array.from({ length: 7 }, () => ({ days: 0, qty: {}, orders: 0 }));
    for (const date of dates) {
      const w = perWeekday[weekdayOf(date)];
      w.days++; w.orders += byDate[date].orders.size;
      for (const [c, q] of Object.entries(byDate[date].qty)) w.qty[c] = (w.qty[c] || 0) + q;
    }
    return {
      source: 'maven',
      avgByWeekday: perWeekday.map((w) => Object.fromEntries(Object.entries(w.qty).map(([c, q]) => [c, q / (w.days || 1)]))),
      ordersByWeekday: perWeekday.map((w) => w.orders / (w.days || 1)),
      hours,
      dates,
      day: (date) => byDate[date] && { qty: byDate[date].qty, orders: byDate[date].orders.size },
    };
  }
  // Built-in summary of the same dataset: category mix times weekday volume.
  const s = MAVEN_SUMMARY;
  const pizzasPerOrder = s.pizzas / s.orders;
  const daysPerWeekday = s.days / 7;
  return {
    source: 'maven-summary',
    avgByWeekday: s.ordersByWeekday.map((o) => Object.fromEntries(
      Object.entries(s.pizzasByCategory).map(([c, q]) => [c, (o * pizzasPerOrder / daysPerWeekday) * (q / s.pizzas)]),
    )),
    ordersByWeekday: s.ordersByWeekday.map((o) => o / daysPerWeekday),
    hours: s.ordersByHour,
    dates: [],
    day: () => null,
  };
}

const peakHours = (hours, n = 3) =>
  Object.entries(hours).sort((a, b) => b[1] - a[1]).slice(0, n).map(([h]) => Number(h)).sort((a, b) => a - b)
    .map((h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`);

// Share of each item within its Maven category. Sides and salads ride on top of pizza sales.
const SIDE_ATTACH = 0.3;  // sides per pizza (simulated)
const SALAD_ATTACH = 0.05;
function itemDemand(menu, catQty, rand) {
  const pizzas = menu.filter((m) => m.section === 'pizza');
  const totalPizzas = Object.values(catQty).reduce((a, b) => a + b, 0);
  const weight = Object.fromEntries(menu.map((m) => [m.id, 0.5 + rand()]));
  const share = (list, total) => {
    const sum = list.reduce((s, m) => s + weight[m.id], 0) || 1;
    return list.map((m) => [m.id, (total * weight[m.id]) / sum]);
  };
  const out = {};
  for (const [cat, q] of Object.entries(catQty)) {
    const inCat = pizzas.filter((m) => m.category === cat);
    for (const [id, n] of share(inCat.length ? inCat : pizzas, q)) out[id] = (out[id] || 0) + n;
  }
  for (const [id, n] of share(menu.filter((m) => m.section === 'side'), totalPizzas * SIDE_ATTACH)) out[id] = n;
  for (const [id, n] of share(menu.filter((m) => m.section === 'salad'), totalPizzas * SALAD_ATTACH)) out[id] = n;
  return out;
}

// ---------- the night ----------
const STAPLES = new Set(['Pizza Dough', 'Mozzarella']); // made or delivered daily; never the story
const MAX_EXPIRING = 4;

export function buildSnapshot() {
  const night = nightSeed();
  const rand = rng(night.seed);
  const { menu, source, restaurant } = loadMenu();
  const info = loadIngredientInfo();
  const pattern = loadPattern();

  // Which night is it? CLOSING_DATE pins the date; otherwise the seed picks the weekday.
  let tonight = process.env.CLOSING_DATE?.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tonight || '')) {
    const wd = Math.floor(rand() * 7);
    const now = iso(new Date());
    tonight = addDays(now, -((weekdayOf(now) - wd + 7) % 7));
  }
  const weekday = weekdayOf(tonight);
  const tomorrow = (weekday + 1) % 7;

  // Today's sales: a real Maven day with the same weekday (or the weekday average, with some noise).
  const sameWeekday = pattern.dates.filter((d) => weekdayOf(d) === weekday);
  const salesDate = pattern.day(tonight) ? tonight : sameWeekday[Math.floor(rand() * sameWeekday.length)];
  const real = salesDate && pattern.day(salesDate);
  const noise = () => 0.85 + rand() * 0.3;
  const todayCat = real
    ? real.qty
    : Object.fromEntries(Object.entries(pattern.avgByWeekday[weekday]).map(([c, q]) => [c, q * noise()]));
  const sold = itemDemand(menu, todayCat, rand);
  const pizzasToday = Math.round(Object.values(todayCat).reduce((a, b) => a + b, 0));
  const top = Object.entries(sold).filter(([id]) => menu.find((m) => m.id === id)?.section === 'pizza').sort((a, b) => b[1] - a[1])[0];
  const today = {
    orders: Math.round(real ? real.orders : pattern.ordersByWeekday[weekday] * noise()),
    pizzas: pizzasToday,
    revenue: Math.round(menu.reduce((s, m) => s + Math.round(sold[m.id] || 0) * m.price, 0)),
    topSeller: menu.find((m) => m.id === top?.[0])?.name || menu[0].name,
    salesDay: real ? salesDate : null,
  };

  // Daily usage per ingredient (grams), from tomorrow's weekday pattern.
  const demand = itemDemand(menu, pattern.avgByWeekday[tomorrow], rng(night.seed + 1));
  const usage = {};
  const usedBy = {};
  for (const m of menu) {
    for (const ing of m.ingredients) {
      usage[ing] = (usage[ing] || 0) + (demand[m.id] || 0) * (m.grams?.[ing] ?? SAMPLE_GRAMS);
      usedBy[ing] = (usedBy[ing] || 0) + 1;
    }
  }

  // Deliveries: each ingredient arrived some days ago. Expiry = delivery date + FoodKeeper shelf life.
  let inventory = Object.entries(usage).map(([name, daily]) => {
    const i = info(name);
    const dailyUse = Math.max(50, Math.round(daily));
    const cycle = Math.max(1, Math.min(i.shelfDays, 7));       // order at least weekly, never past shelf life
    const age = STAPLES.has(name) ? 0 : Math.floor(rand() ** 2 * cycle); // most stock is fairly fresh
    const delivered = dailyUse * cycle * (0.8 + rand() * 0.9);
    const stock = Math.max(Math.round(dailyUse * 0.15), Math.round(delivered - dailyUse * age * (0.7 + rand() * 0.5)));
    return {
      name, kind: i.kind, storage: i.storage, dailyUse, stock,
      shelfDays: i.shelfDays, age, foodkeeper: i.foodkeeper, proxy: i.proxy,
      unitCost: i.costPerKg / 1000, // USD per gram
    };
  });
  const setAge = (it, age) => { it.age = Math.max(0, Math.min(age, it.shelfDays - 1)); };
  for (const it of inventory) setAge(it, it.age);

  // Tonight's story: 2–4 fridge items expire tomorrow with stock to spare. The seed picks which.
  const canExpire = (it) => it.storage === 'fridge' && !STAPLES.has(it.name) && it.shelfDays <= 10;
  const daysLeft = (it) => it.shelfDays - it.age;
  const shuffled = (list) => list.map((x) => [rand(), x]).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
  let expiring = shuffled(inventory.filter((it) => canExpire(it) && daysLeft(it) <= 1));
  const want = 2 + Math.floor(rand() * (MAX_EXPIRING - 1));
  for (const it of expiring.slice(want)) setAge(it, Math.floor(rand() * (it.shelfDays - 1))); // came in fresher
  expiring = expiring.slice(0, want);
  for (const it of shuffled(inventory.filter((it) => canExpire(it) && !expiring.includes(it)))) {
    if (expiring.length >= want) break;
    setAge(it, it.shelfDays - 1);
    expiring.push(it);
  }
  for (const it of expiring) it.stock = Math.round(it.dailyUse * (1.3 + rand() * 1.2));

  // Running low: 1–3 items, never one that nearly every dish needs (that would block every special).
  const tooCommon = (it) => usedBy[it.name] > menu.length * 0.35;
  const lowCandidates = shuffled(inventory.filter((it) => !expiring.includes(it) && !tooCommon(it) && it.storage === 'fridge'));
  const wantLow = 1 + Math.floor(rand() * 3);
  for (const it of inventory) if (!expiring.includes(it) && it.stock < it.dailyUse * 0.6) it.stock = Math.round(it.dailyUse * (0.8 + rand()));
  for (const it of lowCandidates.slice(0, wantLow)) it.stock = Math.max(20, Math.round(it.dailyUse * (0.15 + rand() * 0.35)));

  inventory = inventory
    .map((it) => {
      const deliveredOn = addDays(tonight, -it.age);
      return {
        ...it,
        deliveredOn,
        expiresOn: addDays(deliveredOn, it.shelfDays),
        daysLeft: it.shelfDays - it.age,
        status: it.shelfDays - it.age <= 1 ? 'expiring' : it.stock < it.dailyUse * 0.6 ? 'low' : 'ok',
      };
    })
    .sort((a, b) => b.dailyUse - a.dailyUse);

  return {
    source,
    restaurant,
    salesSource: pattern.source,
    seed: night.label,
    seedFixed: night.fixed,
    date: tonight,
    weekday: WEEKDAYS[weekday],
    peakHours: peakHours(pattern.hours),
    menu,
    inventory,
    today,
  };
}
