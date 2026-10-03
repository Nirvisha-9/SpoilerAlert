// @pantry — the POS watcher. Wakes up at closing and reports what needs attention.
// Deterministic on purpose: inventory math should never be "creative".
import { fmtQty } from '../data.js';

const plural = (name) => /s$/i.test(name);
const dayName = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

export function pantryReport(snapshot) {
  const expiring = snapshot.inventory.filter((i) => i.status === 'expiring');
  const low = snapshot.inventory.filter((i) => i.status === 'low');
  const lines = [
    ...expiring.map((i) => {
      const when = i.daysLeft <= 0 ? 'tonight' : 'tomorrow';
      return {
        item: i.name,
        status: 'expiring',
        text: plural(i.name)
          ? `${i.name}: ${fmtQty(i.stock)} of us, in since ${dayName(i.deliveredOn)}. USDA gives us ${i.shelfDays} days, so we expire ${when}. Use us or lose us.`
          : `${i.name}: ${fmtQty(i.stock)} of me, in since ${dayName(i.deliveredOn)}. USDA gives me ${i.shelfDays} days, so I expire ${when}. Use me or lose me.`,
      };
    }),
    ...low.map((i) => ({
      item: i.name,
      status: 'low',
      text: `${i.name}: only ${fmtQty(i.stock)} left and we go through ${fmtQty(i.dailyUse)} a day.`,
    })),
  ];
  return { expiring, low, lines };
}
