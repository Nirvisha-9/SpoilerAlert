// Band adapter. Mirrors every agent message into a Band room so the agents
// coordinate there and the room becomes the audit log.
//
// Until wired, messages only go to our own stage UI. To wire it, give Claude Code
// docs.band.ai and the prompt in README.md, "Wire up Band". Then set USE_BAND=1.

export const bandOn = () => process.env.USE_BAND === '1';

/**
 * @param {string} handle  e.g. '@pantry'
 * @param {string} text
 */
export async function postToRoom(handle, text) {
  if (!bandOn()) return;
  throw new Error('Band adapter not wired yet');
}
