# Spoiler Alert — brag plan

**What it is:** When a pizzeria closes, AI agents find the stock that expires tomorrow, pitch a special that uses it, check the margin, and get the chef's OK. The result is a finished menu card with a QR code.
**For:** Restaurant owners losing money on food that spoils.
**Sets it apart:** The ingredients talk ("Use us or lose us"), a margin critic blocks bad ideas, and the chef approves the result. You end up with a menu card people can order from.
**Funniest real moment:** @margin-critic stamping BLOCKED on a 118% food-cost special.
**Visual hook:** A dark stockroom shelf. The sign flips to CLOSED and the expiring jars light up and start talking.
**Share caption:** see share-copy.txt

**Angle:** Night to sunrise, the same arc as the app. Real data from one real run (seed 925479, Tue Oct 6 2026). Tone: `default`, playful and clean. Landscape, about 21.5s, 120 BPM (one beat = 0.5s).

**Identity (from src/styles.css):** ink #1c2140, amber #f2a93b, tomato #e4573d, basil #5daa5f, chalkboard #24312a, and the sunrise gradient. Fonts: Bagel Fat One, Figtree, Caveat.

| # | Time | Scene | On screen (all real copy) |
|---|---|---|---|
| 1 Hook | 0–4.0 | The shelf sleeps, the sign flips to CLOSED, the expiring jars light up, and Chicken Wings speaks | "Closing time. The stockroom wakes up." Bubble: "7.4 kg of us… we expire tomorrow. Use us or lose us." |
| 2 Reveal | 4.0–7.5 | Logo slams in | **Spoiler Alert**: "We know how your ingredients end. On tomorrow's menu." |
| 3 Highlight | 7.5–11.5 | The room: chef-assistant pitches, the critic approves, then a BLOCKED stamp | "Agents pitch specials. A critic checks the margin." |
| 4 Highlight | 11.5–14.0 | Chef's phone rises, Approve is tapped | "The chef has the final say." |
| 5 Highlight | 14.0–18.5 | Sunrise. The chalkboard card builds (photo develops, name types, price stamps, QR drops), and the impact card appears | "$47 of stock rescued tonight" |
| 6 Outro | 18.5–21.5 | Logo and the one-line pitch | "AI agents turn a pizzeria's expiring stock into tomorrow's special." |

**Sound:** C major / A minor at 120 BPM. The night uses soft A-minor plucks with a muted kick. At sunrise it opens into C major with a pad and the app's own sunrise arpeggio (C5 E5 G5 C6). The effects use the app's sfx pitches (chime C6/G5, ok E5/B5, stamp thud) and are mixed under the music with shared reverb.

## Voiceover (brag-voice.mp4)
Deepgram Aura (`@cf/deepgram/aura-1`, voice "asteria") via the project's Cloudflare Workers AI account. Music ducks under the voice.

| Start | Line |
|---|---|
| 0.35s | When the pizzeria closes, the stockroom wakes up. |
| 4.1s | Spoiler Alert. We know how your ingredients end. |
| 7.75s | Agents pitch specials. A critic blocks the ones that lose money. |
| 11.65s | The chef has the final say. |
| 14.2s | By morning: a menu card, and forty-seven dollars of stock rescued. |
| 18.8s | Spoiler Alert. Tomorrow's waste, tonight's special. |
