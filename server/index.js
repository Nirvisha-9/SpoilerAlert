import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSnapshot, statusOf, addDays } from './data.js';
import { pantryReport } from './agents/pantry.js';
import { proposeSpecials } from './agents/chefAssistant.js';
import { reviewSpecial } from './agents/marginCritic.js';
import { buildMenuCard } from './menuCard.js';
import { readMemory, remember, forget } from './memory.js';
import { postToRoom } from './band.js';

const app = express();
app.use(express.json());
const SPEED = Number(process.env.SPEED || 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * SPEED));

// ---------- state + live updates (Server-Sent Events) ----------
let snapshot = buildSnapshot();
// The shelf shows what tonight is about first (expiring, low), then the busiest ingredients.
const shelfItems = (inv) => [...inv.filter((i) => i.status !== 'ok'), ...inv.filter((i) => i.status === 'ok')].slice(0, 15);
const shelfTiles = () => shelfItems(snapshot.inventory).map(({ name, kind, stock, dailyUse, daysLeft }) => ({ name, kind, stock, dailyUse, daysLeft, status: 'asleep' }));
const fresh = () => ({
  phase: 'open', // open → closing → pantry → huddle → chef → sunrise
  date: snapshot.date,
  seed: snapshot.seed,
  source: snapshot.source,
  salesSource: snapshot.salesSource,
  today: snapshot.today,
  shelf: shelfTiles(),
  messages: [],
  proposals: [],
  special: null,
  orders: [],
  impact: null,
});
let state = fresh();
let run = 0; // bumps on reset so an in-flight night stops
const clients = new Set();

function push(fx) {
  const payload = `data: ${JSON.stringify({ state, fx })}\n\n`;
  for (const res of clients) res.write(payload);
}
function say(from, text, kind = 'agent') {
  state.messages.push({ id: state.messages.length + 1, from, text, kind });
  postToRoom(from, text).catch((e) => console.warn('[band]', e.message));
  push();
}

app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ state })}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
});
app.get('/api/state', (_req, res) => res.json(state));

// ---------- closing count: read and correct tonight's inventory before the agents run ----------
const MAX_DAYS_LEFT = 30;
const inventoryView = () => ({
  date: snapshot.date,
  seed: snapshot.seed,
  editable: state.phase === 'open',
  items: snapshot.inventory.map(({ name, kind, stock, dailyUse, daysLeft, shelfDays, expiresOn, status, edited }) =>
    ({ name, kind, stock, dailyUse, daysLeft, shelfDays, expiresOn, status, edited: Boolean(edited) })),
});

app.get('/api/inventory', (_req, res) => res.json(inventoryView()));

// Body: { items: [{ name, stock?, daysLeft? }] }. All edits are checked first; nothing is saved if any is invalid.
app.post('/api/inventory', (req, res) => {
  if (state.phase !== 'open') return res.status(409).json({ error: 'The count is closed once the shop closes. Start over to count again.' });
  const edits = req.body?.items;
  if (!Array.isArray(edits) || edits.length === 0) return res.status(400).json({ error: 'Send at least one item to update.' });
  const errors = [];
  const changes = [];
  for (const e of edits) {
    const item = snapshot.inventory.find((i) => i.name === e?.name);
    if (!item) { errors.push({ name: e?.name, field: 'name', error: `${e?.name || 'That item'} isn't in tonight's inventory.` }); continue; }
    const change = { item };
    if (e.stock !== undefined) {
      const stock = Number(e.stock);
      if (e.stock === '' || !Number.isFinite(stock) || stock < 0) errors.push({ name: item.name, field: 'stock', error: 'Stock must be 0 or more grams.' });
      else change.stock = Math.round(stock);
    }
    if (e.daysLeft !== undefined) {
      const days = Number(e.daysLeft);
      if (e.daysLeft === '' || !Number.isInteger(days) || days < 0 || days > MAX_DAYS_LEFT) errors.push({ name: item.name, field: 'daysLeft', error: `Days left must be a whole number from 0 to ${MAX_DAYS_LEFT}.` });
      else change.daysLeft = days;
    }
    changes.push(change);
  }
  if (errors.length) return res.status(400).json({ error: errors[0].error, errors });

  for (const { item, stock, daysLeft } of changes) {
    if (stock !== undefined) item.stock = stock;
    if (daysLeft !== undefined) {
      item.daysLeft = daysLeft;
      item.expiresOn = addDays(snapshot.date, daysLeft);
      // Keep "delivered + shelf life = expiry" true for the pantry's message; never in the future.
      const delivered = addDays(item.expiresOn, -item.shelfDays);
      item.deliveredOn = delivered < snapshot.date ? delivered : snapshot.date;
    }
    item.edited = true;
    item.status = statusOf(item);
  }
  state.shelf = shelfTiles();
  push();
  res.json(inventoryView());
});

// ---------- the night ----------
async function runNight(id, auto) {
  const alive = () => id === run;
  state.phase = 'closing'; push();
  await sleep(2200); if (!alive()) return;

  const t = state.today;
  state.phase = 'pantry';
  say('@pantry', `Closing count done. ${t.orders} orders, ${t.pizzas} pizzas, $${t.revenue.toLocaleString()} today. Waking the shelf.`);
  await sleep(1400);

  const report = pantryReport(snapshot);
  for (const item of state.shelf) item.status = 'ok';
  push();
  await sleep(700);
  for (const line of report.lines) {
    if (!alive()) return;
    const tile = state.shelf.find((s) => s.name === line.item);
    if (tile) tile.status = line.status;
    say(line.item, line.text, line.status);
    await sleep(1300);
  }

  state.phase = 'huddle';
  const memory = readMemory();
  say('@chef-assistant', `Looking through our recipes for anything that uses ${report.expiring.map((i) => i.name.toLowerCase()).join(', ')}.`);
  await sleep(1600); if (!alive()) return;
  const { proposals, notes } = await proposeSpecials({ menu: snapshot.menu, expiring: report.expiring, low: report.low, history: memory.decisions });
  for (const n of notes.slice(0, 2)) { say('@chef-assistant', n, 'memory'); await sleep(1100); }
  for (const p of proposals) {
    if (!alive()) return;
    state.proposals.push({ ...p, review: null });
    say('@chef-assistant', `${p.kind === 'volume' ? 'Volume push' : 'Idea'}: ${p.name}, $${p.price.toFixed(2)}. ${p.pitch}`);
    await sleep(1300);
  }

  for (const p of state.proposals) {
    if (!alive()) return;
    p.review = reviewSpecial(p, snapshot.inventory, snapshot.menu);
    say('@margin-critic', p.review.text, p.review.approved ? 'approved' : 'blocked');
    push({ type: p.review.approved ? 'approved' : 'blocked', id: p.id });
    await sleep(1500);
  }

  const ready = state.proposals.filter((p) => p.review?.approved);
  state.phase = 'chef';
  say('@chef-assistant', ready.length
    ? `Chef, ${ready.length} special${ready.length > 1 ? 's' : ''} passed the critic and need${ready.length > 1 ? '' : 's'} your call.`
    : `Chef, nothing passed the critic tonight. I'll try again tomorrow.`);

  if (auto && ready[0]) { await sleep(5000); if (alive()) await approve(ready[0].id, ''); }
}

async function approve(id, note, rename) {
  const p = state.proposals.find((x) => x.id === id);
  if (!p || !p.review?.approved || state.special) return null;
  const special = {
    ...p,
    name: rename?.trim() || p.name,
    description: note?.trim() ? `${p.description} Chef's twist: ${note.trim()}.` : p.description,
  };
  say('Chef', note?.trim() ? `Go with ${special.name}. ${note.trim()}.` : `Go with ${special.name}.`, 'human');
  remember({ verdict: 'approved', recipeId: p.recipeId, name: special.name, note });
  state.phase = 'sunrise'; push({ type: 'sunrise' });

  const card = await buildMenuCard(special, snapshot.inventory, snapshot.menu);
  const expected = Math.max(25, Math.round(state.today.pizzas * 0.2)); // assume the special is ~20% of tomorrow's pizzas
  let grams = 0, saved = 0;
  for (const name of special.rescues) {
    const inv = snapshot.inventory.find((i) => i.name === name);
    const used = Math.min(inv.stock, expected * (special.grams?.[name] ?? 60) * (special.portions?.[name] || 1));
    grams += used; saved += used * inv.unitCost;
  }
  const atRisk = snapshot.inventory.filter((i) => i.status === 'expiring').reduce((s, i) => s + i.stock * i.unitCost, 0);
  state.special = card;
  state.impact = { grams: Math.round(grams), savedTonight: Math.round(saved), atRisk: Math.round(atRisk), perMonth: Math.round(saved * 30), expected };
  say('@chef-assistant', `Menu card is live. Scan to order ${special.name}.`);
  push({ type: 'card' });
  return card;
}

// ---------- routes ----------
app.post('/api/night/start', (req, res) => {
  if (state.phase !== 'open') return res.status(409).json({ error: 'The night is already running. Reset first.' });
  runNight(run, Boolean(req.body?.auto));
  res.json({ ok: true });
});

app.post('/api/approve', async (req, res) => {
  const card = await approve(req.body?.id, req.body?.note, req.body?.rename);
  if (!card) return res.status(400).json({ error: 'That special is not approved by the critic, or a special is already live.' });
  res.json(card);
});

app.post('/api/pass', (req, res) => {
  const p = state.proposals.find((x) => x.id === req.body?.id);
  if (!p) return res.status(404).json({ error: 'No special with that id.' });
  remember({ verdict: 'passed', recipeId: p.recipeId, name: p.name, note: req.body?.note });
  state.proposals = state.proposals.filter((x) => x.id !== p.id);
  say('Chef', `Pass on ${p.name}.${req.body?.note ? ' ' + req.body.note : ''}`, 'human');
  say('@chef-assistant', `Noted. I'll remember that for next time.`, 'memory');
  res.json({ ok: true });
});

app.post('/api/orders', (req, res) => {
  if (!state.special) return res.status(400).json({ error: "Tonight's special isn't live yet." });
  const name = String(req.body?.name || 'Guest').replace(/[<>]/g, '').slice(0, 24) || 'Guest';
  const order = { id: state.orders.length + 1, name, item: state.special.name, at: Date.now() };
  state.orders.push(order);
  push({ type: 'order', id: order.id });
  res.json(order);
});

// Tonight's special as schema.org JSON, for shopper agents.
app.get('/api/special.json', (_req, res) => {
  if (!state.special) return res.status(404).json({ error: 'No special yet tonight.' });
  res.json(state.special.structured);
});

app.post('/api/reset', (req, res) => {
  run++;
  if (req.body?.forgetChef) forget();
  snapshot = buildSnapshot();
  state = fresh();
  push({ type: 'reset' });
  res.json({ ok: true });
});

// ---------- production: serve the built front end ----------
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => console.log(`Spoiler Alert API on http://localhost:${PORT}  (menu: ${snapshot.source}, sales: ${snapshot.salesSource}, night seed: ${snapshot.seed})`));
