// Remembers what the chef approved and passed on, so suggestions improve every night.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'memory.json');

export function readMemory() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { decisions: [] }; }
}
export function remember(decision) {
  const mem = readMemory();
  mem.decisions.push({ ...decision, at: new Date().toISOString() });
  fs.writeFileSync(FILE, JSON.stringify(mem, null, 2));
  return mem;
}
export function forget() {
  try { fs.unlinkSync(FILE); } catch {}
}
