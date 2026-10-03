# Spoiler Alert

**We know how your ingredients end. On tomorrow's menu.**

When a pizzeria closes, its stockroom wakes up. Agents find what's expiring and what's low,
turn tomorrow's waste into tonight's special, check the margin, and ask the chef to approve.
The approved special becomes a finished menu card with a photo and a QR code customers can order from.

Merchant P&L line we move: **food cost**, by cutting waste.

## Run it

```bash
npm install
cp .env.example .env      # then add your ZOOWORK_API_KEY
npm run dev
```

- Stage screen: http://localhost:5173
- Chef's phone (WhatsApp stand-in): http://localhost:5173/chef
- Audience order page (what the QR opens): http://localhost:5173/order
- Booth loop for the gallery walk: http://localhost:5173/?loop

Keys on the stage screen: **Space** closes the shop, **R** starts over.

Check tonight's data any time: `npm run inventory` (prints the night seed, what's expiring and what's low).

## Data: what's real and what's simulated

| Data | Source | File |
|---|---|---|
| Menu (the recipe book) | **Real**: Tandoori Pizza, San Jose. Names, listed ingredients, delivery-app prices. Unlisted ingredients and all gram amounts are approximate and marked so. | `data/restaurant-menu.json` |
| Sales patterns | **Real**: Maven Analytics "Pizza Place Sales" (which categories sell on which weekday and hour). Each menu item maps to its closest Maven category. | `data/*.csv` (optional, see `data/README.md`) |
| Shelf life | **Real**: USDA FoodKeeper refrigerated values. Items FoodKeeper doesn't list use the closest item, marked `"proxy"`. | `data/shelf-life.json` |
| Deliveries, stock, unit costs | **Simulated**. Expiry = simulated delivery date + USDA shelf life. | `data/unit-costs.json`, `server/data.js` |

Only the restaurant's menu text is used. Don't add its logo or food photos to the app.

Without the Maven CSVs the app uses the dataset's published totals (orders by weekday and hour, pizzas by category).
If `restaurant-menu.json` is missing it falls back to the built-in sample menu in `server/seed.js`, so the demo never breaks.

### A different night every run

Every server start and every **R** reset builds a new night: the seed picks the day of the week, delivery dates and
stock levels, so different items expire or run low. To rehearse the same night, put `NIGHT_SEED=<number>` in `.env`
(`npm run inventory` prints tonight's seed).

## How it fits together

| Piece | File | Runs on |
|---|---|---|
| @pantry: wakes up, flags expiring and low stock | `server/agents/pantry.js` | rules (inventory math should be exact) |
| @chef-assistant: proposes specials from our recipes | `server/agents/chefAssistant.js` | **ZooWork** agent, with a rule-based fallback |
| @margin-critic: blocks specials above 32% food cost | `server/agents/marginCritic.js` | rules |
| Chef approval and memory of past decisions | `server/index.js`, `server/memory.js` | the human gate |
| Menu card: photo, copy, price, QR, schema.org data | `server/menuCard.js` | **ZooWork** image model, with an illustrated fallback |
| Agent room | `server/band.js` | **Band** |

Every ZooWork or Band call has a fallback, so a slow API never breaks the live demo.

## Wire up ZooWork (paste into Claude Code, with the ZooWork skill installed)

> Using the ZooWork SDK skill, implement the two functions in `server/zoowork.js`.
> 1. `askChefAssistant(prompt)`: create (once, then reuse) a ZooWork managed agent called "chef-assistant" with
> instructions: "You are @chef-assistant for a neighborhood Indian-fusion pizzeria in San Jose. You turn ingredients that
> expire tomorrow into specials using only the pizzeria's own recipes. Always reply with only the JSON the user asks for."
> Upload `data/restaurant-menu.json` as its files if the SDK supports files. For each call, open a session, send the prompt,
> wait for the final reply, and return the reply text.
> 2. `generateDishImage(prompt)`: call a ZooWork built-in image model and return an image URL or data URL.
> Read the API key from `process.env.ZOOWORK_API_KEY`. Don't change any other file. Then tell me how to test it.

Then set `USE_ZOOWORK=1` in `.env` and run a night.

## Wire up Band (paste into Claude Code)

> Read docs.band.ai and the hacker guide at band.ai/hacker-guide. Implement `postToRoom(handle, text)` in
> `server/band.js` so every agent message is posted into one Band room called "Spoiler Alert kitchen", with
> @pantry, @chef-assistant and @margin-critic as separate seats. Keep the function signature. Don't change other files.

Then set `USE_BAND=1` in `.env`.

## Put the QR code on the internet

Phones in the audience need a public URL. Either deploy (`npm run build && npm start` serves everything on port 3001)
or run a tunnel, e.g. `npx cloudflared tunnel --url http://localhost:3001` after building. Put that URL in `PUBLIC_URL`.

## Shopper agents can read the special too

`GET /api/special.json` returns tonight's special as schema.org `MenuItem` data.
