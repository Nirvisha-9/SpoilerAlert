// node server/testZoowork.js — one live call to the ZooWork chef-assistant agent.
// The first run creates and starts the agent, so it can take a minute.
import 'dotenv/config';
import { askChefAssistant } from './zoowork.js';

if (!process.env.ZOOWORK_API_KEY) {
  console.error('ZOOWORK_API_KEY is not set in .env');
  process.exit(1);
}

const prompt = `Ingredients that expire tomorrow: Marinated Paneer (1.2 kg).
Our recipes: chili_paneer: Chili Paneer Pizza [$28.59]; shahi_paneer: Shahi Paneer Pizza [$28.59].
Propose 1 special. Reply with ONLY a JSON array:
[{"recipeId":"...","name":"catchy special name","description":"one sentence","price":28.59,"pitch":"one sentence"}]`;

const started = Date.now();
try {
  const reply = await askChefAssistant(prompt);
  console.log(`Reply after ${((Date.now() - started) / 1000).toFixed(1)}s:\n${reply}`);
  try { JSON.parse(reply.replace(/```json|```/g, '').trim()); console.log('\nParses as JSON: yes'); }
  catch { console.log('\nParses as JSON: no'); }
} catch (e) {
  // Status and type only; never echo request details that could carry the key.
  console.error(`ZooWork call failed: ${e.status ? `${e.status} ${e.type || ''} ` : ''}${e.message}`);
  process.exit(1);
}
