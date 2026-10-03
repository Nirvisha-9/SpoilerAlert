// node server/testImage.js — generate one pizza photo with Cloudflare Workers AI (FLUX.1 schnell),
// save it as test-image.<ext> in the project root, and print how long it took.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDishImage, cloudflareOn, imageType } from './cloudflare.js';
import { loadMenu } from './data.js';
import { photoPrompt } from './menuCard.js';

if (!cloudflareOn()) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in .env first.');
  process.exit(1);
}

const recipe = loadMenu().menu.find((m) => m.id === 'tandoori_chicken');
const prompt = photoPrompt(recipe.name, recipe.ingredients.filter((x) => x !== 'Pizza Dough'));
console.log(`Prompt: ${prompt}`);

const started = Date.now();
try {
  const dataUrl = await generateDishImage(prompt);
  const seconds = (Date.now() - started) / 1000;
  const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  const { ext } = imageType(buf);
  // FLUX.1 schnell returns JPEG, so this is normally test-image.jpg (gitignored as test-image.*).
  const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', `test-image.${ext}`);
  fs.writeFileSync(out, buf);
  console.log(`Generated in ${seconds.toFixed(1)}s (${seconds <= 20 ? 'within' : 'over'} the 20 s menu-card limit). Saved ${path.basename(out)}, ${(buf.length / 1024).toFixed(0)} KB.`);
} catch (e) {
  console.error(`Image generation failed after ${((Date.now() - started) / 1000).toFixed(1)}s: ${e.message}`);
  process.exit(1);
}
