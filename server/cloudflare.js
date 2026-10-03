// Dish photos from Cloudflare Workers AI, model @cf/black-forest-labs/flux-1-schnell.
// REST: POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}
// Body { prompt (1–2048 chars), steps (≤ 8, default 4) }. Reply { result: { image: <base64> }, success }.
// Reads CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN from the environment; never logs them.

const MODEL = '@cf/black-forest-labs/flux-1-schnell';
const STEPS = 4; // the model's default; up to 8 is sharper but slower

export const cloudflareOn = () => Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);

// The model documents JPEG output; check the bytes rather than trusting that.
export function imageType(buf) {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/**
 * Generate a food photo.
 * @param {string} prompt
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<string>} A data: URL.
 */
export async function generateDishImage(prompt, { signal } = {}) {
  if (!cloudflareOn()) throw new Error('Cloudflare credentials are not set');
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID)}/ai/run/${MODEL}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: prompt.slice(0, 2048), steps: STEPS }),
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.success === false) {
    const detail = data?.errors?.map((e) => `${e.code ?? ''} ${e.message ?? ''}`.trim()).join('; ') || res.statusText;
    throw new Error(`Cloudflare Workers AI ${res.status}: ${detail}`);
  }
  const b64 = data?.result?.image ?? data?.image;
  if (typeof b64 !== 'string' || !b64) throw new Error('Cloudflare Workers AI returned no image');
  const type = imageType(Buffer.from(b64.slice(0, 64), 'base64'));
  if (!type) throw new Error('Cloudflare Workers AI returned data that is not an image');
  return `data:${type.mime};base64,${b64}`;
}
