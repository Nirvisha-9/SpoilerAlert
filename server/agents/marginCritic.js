// @margin-critic — blocks any special that loses money. Rules, not vibes.
export const FOOD_COST_TARGET = 0.32; // 32% food cost is a common pizzeria target
const BASE_COST = 1.6; // dough + base sauce + base cheese, only for sample recipes without gram amounts
const SAMPLE_GRAMS = 60;

export function reviewSpecial(special, inventory) {
  const costPerGram = (name) => inventory.find((i) => i.name === name)?.unitCost ?? 0.008;
  const grams = (name) => special.grams?.[name] ?? SAMPLE_GRAMS;
  const base = special.grams ? 0 : BASE_COST;
  const cost = base + special.ingredients.reduce((sum, ing) => sum + costPerGram(ing) * grams(ing) * (special.portions?.[ing] || 1), 0);
  const pct = cost / special.price;
  const approved = pct <= FOOD_COST_TARGET;
  return {
    approved,
    cost: Number(cost.toFixed(2)),
    foodCostPct: Math.round(pct * 100),
    text: approved
      ? `${special.name}: ${Math.round(pct * 100)}% food cost at $${special.price.toFixed(2)}. Approved.`
      : `${special.name}: ${Math.round(pct * 100)}% food cost. We'd lose about $${(cost - special.price * FOOD_COST_TARGET).toFixed(2)} a plate against target. Blocked.`,
  };
}
