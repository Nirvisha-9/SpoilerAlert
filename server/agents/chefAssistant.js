// @chef-assistant — turns tomorrow's waste into tonight's special.
// Uses the ZooWork agent when wired; otherwise a rule-based fallback so the demo never breaks.
import { askChefAssistant, zooworkOn } from '../zoowork.js';
import { fmtQty } from '../data.js';

const short = (name) => name.replace(/^The\s+/i, '').replace(/\s+Pizza$/i, '');
const dish = (m) => (m.section === 'pizza' ? `${short(m.name)} pizza` : short(m.name));
const qty = (g) => (g == null ? '' : fmtQty(g));
const THEMES = ['Last Call', 'Midnight', 'Closing Time'];

function buildPrompt({ menu, expiring, low, history }) {
  return `You are @chef-assistant for a neighborhood Indian-fusion pizzeria in San Jose. It is closing time.
Ingredients that expire by tomorrow (use them!): ${expiring.map((i) => `${i.name} (${qty(i.stock)} left)`).join(', ')}.
Running low (avoid): ${low.map((i) => i.name).join(', ') || 'none'}.
Chef's past decisions: ${history.map((d) => `${d.verdict} "${d.name}"${d.note ? ` (${d.note})` : ''}`).join('; ') || 'none yet'}.
Our recipes (only use these, no new ingredients):
${menu.map((m) => `- ${m.id}: ${m.name} [$${m.price}] ${m.ingredients.map((x) => (m.grams ? `${x} ${m.grams[x]} g` : x)).join(', ')}`).join('\n')}

Propose exactly 3 options for tomorrow, each built on one of our recipes:
- 2 normal specials ("kind": "normal") that use the most expiring stock. Price each at its recipe's menu price shown in [$...]; don't discount.
- 1 volume push ("kind": "volume"): the recipe that burns the most expiring stock, with extra toppings and a deep discount
  (at least 40% off the menu price). In "extra", list which of that recipe's ingredients get extra, as a multiplier from 2 to 3,
  using the ingredient names exactly as written above. Give every expiring ingredient in it at least 2.
Reply with ONLY a JSON array of 3 objects, no prose:
[{"kind":"normal","recipeId":"...","name":"catchy special name","description":"one appetizing sentence","price":<the recipe's menu price>,"pitch":"one sentence to the chef on why"},
 {"kind":"volume","recipeId":"...","name":"...","description":"...","price":<discounted price>,"extra":{"<ingredient>":3},"pitch":"..."}]`;
}

function fromLLM(text, menu, expiringNames) {
  const json = JSON.parse(text.replace(/```json|```/g, '').trim());
  return json
    .map((p) => {
      const recipe = menu.find((m) => m.id === p.recipeId);
      if (!recipe) return null;
      const kind = p.kind === 'volume' ? 'volume' : 'normal';
      const rescues = recipe.ingredients.filter((x) => expiringNames.has(x));
      // Extra toppings only count for the volume push, only on the recipe's own ingredients, 1–4x.
      let portions = {};
      if (kind === 'volume') {
        for (const [ing, mult] of Object.entries(p.extra || {})) {
          const m = Number(mult);
          if (recipe.ingredients.includes(ing) && Number.isFinite(m)) portions[ing] = Math.min(4, Math.max(1, m));
        }
        if (!Object.keys(portions).length) portions = Object.fromEntries(rescues.map((x) => [x, 3]));
      }
      return {
        kind,
        recipeId: recipe.id,
        name: p.name,
        description: p.description,
        price: Number(p.price) || (kind === 'volume' ? Number((recipe.price * 0.5).toFixed(2)) : recipe.price),
        pitch: p.pitch,
        ingredients: recipe.ingredients,
        grams: recipe.grams,
        portions,
        rescues,
        source: 'zoowork',
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.kind === 'volume') - (b.kind === 'volume')) // normal specials first
    .map((p, i) => ({ id: `s${i + 1}`, ...p }));
}

function fallback({ menu, expiring, low, history }) {
  const expiringNames = new Set(expiring.map((i) => i.name));
  const lowNames = new Set(low.map((i) => i.name));
  const passed = new Set(history.filter((d) => d.verdict === 'passed').map((d) => d.recipeId));
  const notes = [];

  const scored = menu
    .map((m) => {
      const rescues = m.ingredients.filter((x) => expiringNames.has(x));
      const blockers = m.ingredients.filter((x) => lowNames.has(x));
      // Value of expiring stock the dish touches, then how much of it each plate uses.
      const atRisk = rescues.reduce((s, x) => { const e = expiring.find((i) => i.name === x); return s + (e ? e.stock * (e.unitCost ?? 0.01) : 0); }, 0);
      const perPlate = rescues.reduce((s, x) => s + (m.grams?.[x] ?? 60), 0);
      const score = (atRisk * 1000 + perPlate) * (m.section === 'pizza' ? 2 : 1); // a pizzeria's special is usually a pizza
      return { m, rescues, blockers, score };
    })
    .filter((r) => r.rescues.length > 0)
    .sort((a, b) => b.score - a.score);

  const usable = [];
  for (const r of scored) {
    if (passed.has(r.m.id)) { notes.push(`Skipping ${short(r.m.name)}: Chef passed on it last time.`); continue; }
    if (r.blockers.length) { notes.push(`Skipping ${short(r.m.name)}: we're low on ${r.blockers.join(' and ')}.`); continue; }
    usable.push(r);
    if (usable.length === 2) break;
  }

  const proposals = usable.map((r, i) => ({
    id: `s${i + 1}`,
    kind: 'normal',
    recipeId: r.m.id,
    name: `${THEMES[i % THEMES.length]} ${short(r.m.name)}`,
    description: `Our ${dish(r.m)}, piled with fresh ${r.rescues.map((x) => x.toLowerCase()).join(' and ')}.`,
    price: r.m.price,
    pitch: `Uses ${r.rescues.join(', ')} that expire tomorrow.`,
    ingredients: r.m.ingredients,
    grams: r.m.grams,
    portions: {},
    rescues: r.rescues,
    source: 'fallback',
  }));

  // One over-generous idea, so the critic has something to catch:
  // double everything, triple the expiring stock, half price.
  if (usable[0]) {
    const r = usable[0];
    const portions = Object.fromEntries(r.m.ingredients.map((x) => [x, r.rescues.includes(x) ? 3 : x === 'Pizza Dough' ? 1 : 2]));
    proposals.push({
      id: 's3',
      kind: 'volume',
      recipeId: r.m.id,
      name: `Loaded ${short(r.m.name)}`,
      description: `Double everything and triple ${r.rescues.map((x) => x.toLowerCase()).join(', triple ')}, half price to clear the shelf.`,
      price: Number((r.m.price * 0.5).toFixed(2)),
      pitch: `Burns the most expiring stock in one go.`,
      ingredients: r.m.ingredients,
      grams: r.m.grams,
      portions,
      rescues: r.rescues,
      source: 'fallback',
    });
  }
  return { proposals, notes };
}

export async function proposeSpecials(ctx) {
  if (zooworkOn()) {
    try {
      const text = await askChefAssistant(buildPrompt(ctx));
      const proposals = fromLLM(text, ctx.menu, new Set(ctx.expiring.map((i) => i.name)));
      if (proposals.length) return { proposals, notes: [] };
    } catch (e) {
      console.warn('[chef-assistant] ZooWork failed, using fallback:', e.message);
    }
  }
  return fallback(ctx);
}
