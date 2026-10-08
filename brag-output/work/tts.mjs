import fs from 'node:fs';
import dotenv from '../../node_modules/dotenv/lib/main.js';
dotenv.config({ path: '../../.env' });
const [model, speaker, text, out] = process.argv.slice(2);
const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`;
const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' },
  body: JSON.stringify({ text, speaker, encoding: 'mp3' }) });
const type = res.headers.get('content-type');
const buf = Buffer.from(await res.arrayBuffer());
if (type?.includes('json')) {
  const j = JSON.parse(buf);
  if (!res.ok || j.success === false) { console.error(res.status, JSON.stringify(j.errors || j).slice(0, 300)); process.exit(1); }
  const b64 = j.result?.audio; fs.writeFileSync(out, Buffer.from(b64, 'base64'));
} else fs.writeFileSync(out, buf);
console.log(out, type, fs.statSync(out).size);
