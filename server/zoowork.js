// ZooWork adapter. Everything that should run on ZooWork goes through here.
//
// Two managed agents, created once each and reused: the chef-assistant (askChefAssistant) and the
// voice command interpreter (interpretCommand). Set USE_ZOOWORK=1 in .env to use them.
// Dish photos come from Cloudflare Workers AI instead (server/cloudflare.js): ZooWork has no
// documented image-generation API.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZooworkClient, ZooworkError, assistantText, isRunFinished, runOutcome } from '@zoowork-ai/sdk';

export const zooworkOn = () => process.env.USE_ZOOWORK === '1' && Boolean(process.env.ZOOWORK_API_KEY);

const CACHE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.cache', 'spoiler-alert');

const AGENTS = {
  chef: {
    name: 'spoiler-alert-chef-assistant',
    labels: { app: 'spoiler-alert', role: 'chef-assistant' },
    instructions:
      'You are @chef-assistant for Tandoori Pizza in San Jose. At closing time you turn ingredients that expire tomorrow ' +
      "into specials, using only the restaurant's own recipes. Always reply with only the JSON the user asks for, no prose.",
    cacheFile: 'zoowork-agent.json',
  },
  interpreter: {
    name: 'spoiler-alert-command-interpreter',
    labels: { app: 'spoiler-alert', role: 'command-interpreter' },
    instructions:
      'You turn one spoken sentence from a pizzeria chef into one app command. You are given the current app state. ' +
      'Reply with only one JSON object, no prose and no code fences: ' +
      '{"action": "close|approve|pass|set_stock|set_expiry|reset|none", "target": "...", "value": ..., "note": "..."}. ' +
      'Use names exactly as listed in the state. If the sentence is not a clear command, reply {"action":"none"}.',
    cacheFile: 'zoowork-command-interpreter.json',
  },
};

let client = null;
// The SDK reads ZOOWORK_API_KEY from the environment itself; we never pass or print the key.
const zc = () => (client ??= createZooworkClient());

// The agent ids live in memory and in node_modules/.cache (gitignored), so each agent is created once.
const cachePath = (cfg) => path.join(CACHE_DIR, cfg.cacheFile);
const readCachedId = (cfg) => { try { return JSON.parse(fs.readFileSync(cachePath(cfg), 'utf8')).agentId || null; } catch { return null; } };
const writeCachedId = (cfg, agentId) => {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath(cfg), JSON.stringify({ agentId, name: cfg.name }, null, 2));
};

async function findOrCreateAgent(cfg) {
  // 1. Cached id, if the agent still exists.
  const cached = readCachedId(cfg);
  if (cached) {
    try {
      const agent = await zc().getAgent(cached);
      if (agent.status?.desired_state !== 'deleted') return agent;
    } catch (e) {
      if (!(e instanceof ZooworkError && e.status === 404)) throw e;
    }
  }
  // 2. An agent we created earlier (cache lost, e.g. after reinstalling node_modules).
  const page = await zc().listAgents({ labels: cfg.labels });
  const existing = page.data.find((a) => a.name === cfg.name && a.status?.desired_state !== 'deleted');
  if (existing) return existing;
  // 3. Create it, on the platform's default chat model, with a stable idempotency key.
  const models = await zc().listModels();
  const model = models.find((m) => m.selectable !== false && m.default_for?.includes('model'))?.model;
  if (!model) throw new Error('No selectable default ZooWork model');
  return zc().createAgent(
    {
      resource: {
        name: cfg.name,
        model: { primary: model },
        persona: { docs: [{ name: 'instructions', content: cfg.instructions }] },
        labels: cfg.labels,
        include_global_skills: false, // they only write JSON; no tools needed
      },
    },
    `${cfg.name}-v1`,
  );
}

async function ensureAgent(cfg) {
  const agent = await findOrCreateAgent(cfg);
  const agentId = agent.agent_id;
  writeCachedId(cfg, agentId);
  // A create receipt has no status; a read has status.desired_state. Start unless already running.
  if (agent.status?.desired_state !== 'running') {
    await zc().startAgent(agentId);
    await zc().waitUntilRunning(agentId, { timeoutMs: 60_000 });
  }
  return agentId;
}

const ready = {}; // key -> Promise<agentId>: one setup at a time, shared by every call
const agentId = (key) => {
  ready[key] ??= ensureAgent(AGENTS[key]).catch((e) => { ready[key] = null; throw e; }); // retry setup on the next call
  return ready[key];
};

// One turn: open a session, send the prompt, wait for the final reply, return its text.
async function runTurn(key, prompt, budgetMs) {
  const id = await agentId(key);
  const session = await zc().createSession(id, { initial_events: [{ type: 'user.message', content: prompt }] });

  const budget = new AbortController();
  const timer = setTimeout(() => budget.abort(), budgetMs);
  let text = '';
  let cursor;
  try {
    // The stream doesn't close at turn end, and the SDK doesn't reconnect: break on run.finished,
    // and reopen from the last cursor if the server drops an idle connection.
    for (let attempt = 0; attempt < 4 && !budget.signal.aborted; attempt++) {
      try {
        for await (const ev of zc().streamEvents(id, session.session_id, { ...(cursor ? { cursor } : {}), signal: budget.signal })) {
          text += assistantText(ev);
          cursor = ev.cursor ?? cursor;
          if (isRunFinished(ev)) {
            const outcome = runOutcome(ev);
            if (outcome !== 'succeeded') throw new Error(`ZooWork run ${outcome ?? 'ended without an outcome'}`);
            return text.trim();
          }
        }
      } catch (e) {
        if (e instanceof ZooworkError && e.status >= 400 && e.status < 500) throw e; // retrying can't fix these
        if (e instanceof Error && e.message.startsWith('ZooWork run')) throw e;
      }
      if (!budget.signal.aborted) await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, budgetMs / 4)));
    }
    throw new Error(budget.signal.aborted ? `ZooWork reply took longer than ${budgetMs / 1000}s` : 'ZooWork stream kept dropping');
  } finally {
    clearTimeout(timer);
    budget.abort(); // releases the open HTTP body
  }
}

/** Create and start both agents in the background, so the first live call doesn't pay for setup. */
export function warmUp() {
  if (!zooworkOn()) return;
  for (const key of Object.keys(AGENTS)) agentId(key).catch((e) => console.warn(`[zoowork] ${AGENTS[key].name} setup failed:`, e.message));
}

/**
 * Ask the @chef-assistant agent for specials.
 * @param {string} prompt  Full prompt including expiring items, recipes and chef history.
 * @returns {Promise<string>} The agent's reply text (expected to be JSON, see chefAssistant.js).
 */
export async function askChefAssistant(prompt) {
  return runTurn('chef', prompt, 90_000); // a stuck run must not hang the night; the caller falls back to rules
}

/**
 * Turn a spoken sentence into a command with the command-interpreter agent.
 * @param {string} prompt  The sentence plus a summary of the current state.
 * @param {number} budgetMs
 * @returns {Promise<string>} The agent's reply text (expected to be one JSON object).
 */
export async function interpretCommand(prompt, budgetMs = 10_000) {
  return runTurn('interpreter', prompt, budgetMs);
}
