// @margin-critic — blocks any special that loses money. Rules, not vibes.
// Rule 1: food cost must be at or under 32% of the price.
// Rule 2: profit per plate (price minus ingredient cost) must be no more than 25% below the menu's
//         average profit for the same kind of dish at the same size. Every menu pizza price is for the
//         small size, so pizzas are compared with pizzas, sides with sides, salads with salads.
export const FOOD_COST_TARGET = 0.32; // 32% food cost is a common pizzeria target
export const MAX_PROFIT_SHORTFALL = 0.25;
const BASE_COST = 1.6; // dough + base sauce + base cheese, only for sample recipes without gram amounts
const SAMPLE_GRAMS = 60;

function costOf(dish, inventory) {
  const costPerGram = (name) => inventory.find((i) => i.name === name)?.unitCost ?? 0.008;
  const grams = (name) => dish.grams?.[name] ?? SAMPLE_GRAMS;
  const base = dish.grams ? 0 : BASE_COST;
  return base + dish.ingredients.reduce((sum, ing) => sum + costPerGram(ing) * grams(ing) * (dish.portions?.[ing] || 1), 0);
}

const money = (n) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;

export function reviewSpecial(special, inventory, menu = []) {
  const cost = costOf(special, inventory);
  const pct = cost / special.price;
  const profit = special.price - cost;

  const section = menu.find((m) => m.id === special.recipeId)?.section || 'pizza';
  const peers = menu.filter((m) => (m.section || 'pizza') === section);
  const avgProfit = peers.length ? peers.reduce((s, m) => s + m.price - costOf(m, inventory), 0) / peers.length : null;
  const unit = section === 'pizza' ? 'pizza' : section === 'salad' ? 'salad' : 'order';
  const a = unit === 'order' ? 'an' : 'a';

  const costOk = pct <= FOOD_COST_TARGET;
  const profitOk = avgProfit == null || profit >= avgProfit * (1 - MAX_PROFIT_SHORTFALL);
  const approved = costOk && profitOk;

  const reasons = [];
  if (!costOk) reasons.push(`${Math.round(pct * 100)}% food cost, over our ${Math.round(FOOD_COST_TARGET * 100)}% target`);
  if (!profitOk) reasons.push(`${money(profit)} profit ${a} ${unit}, ${money(avgProfit - profit)} less than a normal ${unit} (${money(avgProfit)})`);

  return {
    approved,
    cost: Number(cost.toFixed(2)),
    foodCostPct: Math.round(pct * 100),
    profit: Number(profit.toFixed(2)),
    avgProfit: avgProfit == null ? null : Number(avgProfit.toFixed(2)),
    lossVsNormal: avgProfit == null ? null : Number(Math.max(0, avgProfit - profit).toFixed(2)),
    text: approved
      ? `${special.name}: ${Math.round(pct * 100)}% food cost, ${money(profit)} profit ${a} ${unit} at ${money(special.price)}. Approved.`
      : `${special.name}: ${reasons.join('; ')}. Blocked.`,
  };
}
