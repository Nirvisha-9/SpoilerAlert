// ZooWork adapter. Everything that should run on ZooWork goes through here.
//
// askChefAssistant runs on a ZooWork managed agent. generateDishImage still throws, and the app
// falls back to its illustrated card, so the demo always works. Set USE_ZOOWORK=1 in .env to use it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZooworkClient, ZooworkError, assistantText, isRunFinished, runOutcome } from '@zoowork-ai/sdk';

export const zooworkOn = () => process.env.USE_ZOOWORK === '1' && Boolean(process.env.ZOOWORK_API_KEY);

const AGENT_NAME = 'spoiler-alert-chef-assistant';
const AGENT_LABELS = { app: 'spoiler-alert', role: 'chef-assistant' };
const AGENT_INSTRUCTIONS =
  'You are @chef-assistant for Tandoori Pizza in San Jose. At closing time you turn ingredients that expire tomorrow ' +
  "into specials, using only the restaurant's own recipes. Always reply with only the JSON the user asks for, no prose.";
const TURN_BUDGET_MS = 90_000; // a stuck run must not hang the night; the caller falls back to rules

// The agent id lives in memory and in node_modules/.cache (gitignored), so we create the agent once.
const CACHE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.cache', 'spoiler-alert', 'zoowork-agent.json');
const readCachedId = () => { try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')).agentId || null; } catch { return null; } };
const writeCachedId = (agentId) => {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify({ agentId, name: AGENT_NAME }, null, 2));
};

let client = null;
// The SDK reads ZOOWORK_API_KEY from the environment itself; we never pass or print the key.
const zc = () => (client ??= createZooworkClient());

let agentReady = null; // Promise<string>: one setup at a time, shared by every call

async function findOrCreateAgent() {
  // 1. Cached id, if the agent still exists.
  const cached = readCachedId();
  if (cached) {
    try {
      const agent = await zc().getAgent(cached);
      if (agent.status?.desired_state !== 'deleted') return agent;
    } catch (e) {
      if (!(e instanceof ZooworkError && e.status === 404)) throw e;
    }
  }
  // 2. An agent we created earlier (cache lost, e.g. after reinstalling node_modules).
  const page = await zc().listAgents({ labels: AGENT_LABELS });
  const existing = page.data.find((a) => a.name === AGENT_NAME && a.status?.desired_state !== 'deleted');
  if (existing) return existing;
  // 3. Create it, on the platform's default chat model, with a stable idempotency key.
  const models = await zc().listModels();
  const model = models.find((m) => m.selectable !== false && m.default_for?.includes('model'))?.model;
  if (!model) throw new Error('No selectable default ZooWork model');
  return zc().createAgent(
    {
      resource: {
        name: AGENT_NAME,
        model: { primary: model },
        persona: { docs: [{ name: 'instructions', content: AGENT_INSTRUCTIONS }] },
        labels: AGENT_LABELS,
        include_global_skills: false, // it only writes JSON; no tools needed
      },
    },
    `${AGENT_NAME}-v1`,
  );
}

async function ensureAgent() {
  const agent = await findOrCreateAgent();
  const agentId = agent.agent_id;
  writeCachedId(agentId);
  // A create receipt has no status; a read has status.desired_state. Start unless already running.
  if (agent.status?.desired_state !== 'running') {
    await zc().startAgent(agentId);
    await zc().waitUntilRunning(agentId, { timeoutMs: 60_000 });
  }
  return agentId;
}

const agentId = () => {
  agentReady ??= ensureAgent().catch((e) => { agentReady = null; throw e; }); // retry setup on the next call
  return agentReady;
};

/**
 * Ask the @chef-assistant agent for specials.
 * @param {string} prompt  Full prompt including expiring items, recipes and chef history.
 * @returns {Promise<string>} The agent's reply text (expected to be JSON, see chefAssistant.js).
 */
export async function askChefAssistant(prompt) {
  const id = await agentId();
  const session = await zc().createSession(id, { initial_events: [{ type: 'user.message', content: prompt }] });

  const budget = new AbortController();
  const timer = setTimeout(() => budget.abort(), TURN_BUDGET_MS);
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
      if (!budget.signal.aborted) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
    throw new Error(budget.signal.aborted ? `ZooWork reply took longer than ${TURN_BUDGET_MS / 1000}s` : 'ZooWork stream kept dropping');
  } finally {
    clearTimeout(timer);
    budget.abort(); // releases the open HTTP body
  }
}

/**
 * Generate a food photo with a ZooWork built-in image model.
 * @param {string} prompt
 * @returns {Promise<string>} An image URL or a data: URL.
 */
export async function generateDishImage(prompt) {
  throw new Error('ZooWork image model not wired yet');
}
