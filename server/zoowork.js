// ZooWork adapter. Everything that should run on ZooWork goes through here.
//
// Right now these functions throw, and the app falls back to built-in logic,
// so the demo always works. To wire ZooWork in, open Claude Code in this repo
// (with the ZooWork skill installed) and paste the prompt from README.md,
// "Wire up ZooWork". Then set USE_ZOOWORK=1 in .env.

export const zooworkOn = () => process.env.USE_ZOOWORK === '1' && Boolean(process.env.ZOOWORK_API_KEY);

/**
 * Ask the @chef-assistant agent for specials.
 * @param {string} prompt  Full prompt including expiring items, recipes and chef history.
 * @returns {Promise<string>} The agent's reply text (expected to be JSON, see chefAssistant.js).
 */
export async function askChefAssistant(prompt) {
  throw new Error('ZooWork chef-assistant not wired yet');
}

/**
 * Generate a food photo with a ZooWork built-in image model.
 * @param {string} prompt
 * @returns {Promise<string>} An image URL or a data: URL.
 */
export async function generateDishImage(prompt) {
  throw new Error('ZooWork image model not wired yet');
}
