// npm run inventory — tonight's seed, what's expiring, and what's low.
import 'dotenv/config';
import { buildSnapshot, fmtQty } from './data.js';

const s = buildSnapshot();
const fk = (i) => (i.proxy ? `proxy: ${i.proxy}` : i.foodkeeper || 'built-in estimate');
const SALES = { maven: 'Maven Analytics CSVs', 'maven-summary': 'Maven Analytics published totals (CSVs not in /data)' };

console.log(`Night seed: ${s.seed}${s.seedFixed ? '  (fixed by NIGHT_SEED)' : '  (random; put NIGHT_SEED=' + s.seed + ' in .env to replay this night)'}`);
console.log(`Tonight: ${s.weekday} ${s.date}`);
console.log(`Menu: ${s.source === 'restaurant' ? `${s.restaurant.name}, ${s.restaurant.city} (${s.menu.length} items)` : 'built-in sample'}  |  Sales patterns: ${SALES[s.salesSource]}`);
console.log(`Today: ${s.today.orders} orders, ${s.today.pizzas} pizzas, $${s.today.revenue.toLocaleString()}, top seller ${s.today.topSeller}${s.today.salesDay ? `  (Maven day ${s.today.salesDay})` : ''}`);
console.log(`Busiest hours (Maven): ${s.peakHours.join(', ')}`);

const expiring = s.inventory.filter((i) => i.status === 'expiring');
console.log(`\nExpiring tomorrow (${expiring.length})`);
console.table(expiring.map((i) => ({ ingredient: i.name, stock: fmtQty(i.stock), delivered: i.deliveredOn, 'shelf (days)': i.shelfDays, expires: i.expiresOn, 'USDA FoodKeeper': fk(i) })));

const low = s.inventory.filter((i) => i.status === 'low');
console.log(`\nRunning low (${low.length})`);
console.table(low.map((i) => ({ ingredient: i.name, stock: fmtQty(i.stock), 'daily use': fmtQty(i.dailyUse), expires: i.expiresOn })));
