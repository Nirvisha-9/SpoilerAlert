# 🍕 Spoiler Alert

**We know how your ingredients end. On tomorrow's menu.**

Spoiler Alert turns a pizzeria's expiring stock into tomorrow's special. When the shop closes, the stockroom
wakes up. AI agents find what expires tomorrow, pitch specials that use it, and check each one's margin. Then
they ask the chef to approve one. The approved special becomes a finished menu card with a photo, a price and
a QR code that customers can order from.

The line on the restaurant's P&L it moves is **food cost**: less stock thrown away, more of it sold.

---

## How a night goes

1. **Closing count.** Before closing, the chef can correct tonight's stock and expiry dates on the stage screen
   (or by voice).
2. **The shelf wakes up.** `@pantry` checks every ingredient. Items that expire tomorrow light up and speak for
   themselves ("Chicken Wings: 7.4 kg of us… we expire tomorrow. Use us or lose us."). Items running low are
   flagged too.
3. **The huddle.** `@chef-assistant` searches the restaurant's own recipes for dishes that use the expiring stock
   and pitches specials. It also pitches one deliberately over-generous "volume push" idea.
4. **The margin check.** `@margin-critic` approves or blocks each idea by the numbers. It blocks anything over
   32% food cost, and anything whose profit is more than 25% below a normal dish of the same kind.
5. **The chef decides.** The specials that passed show up on the chef's phone. The chef approves one (optionally
   with a twist, like "make it spicy") or passes. Every decision is remembered, so later suggestions take it
   into account.
6. **Sunrise.** The approved special becomes a chalkboard menu card. The photo develops, the name types itself
   out, the price is stamped on and a QR code drops in. The screen also shows how much stock was rescued and
   what that adds up to over a month. Orders from the QR page print as tickets on the stage.

## Screens

| URL | What it is |
|---|---|
| `/` | **Stage screen.** The stockroom, the agent room, the chef's phone and the sunrise menu card |
| `/?loop` | **Booth loop.** Runs a night on its own, auto-approves, holds the card for a minute, then starts over |
| `/chef` | **Chef's phone.** A WhatsApp-style page for approving or passing on specials from a real phone |
| `/order` | **Order page.** What the QR code opens: customers enter a name and order tonight's special |

## Quick start

Requires **Node 20+**.

```bash
npm install
cp .env.example .env     # works as-is; add keys later to turn on the AI services
npm run dev
```

Open http://localhost:5173 and press **Space** (or click **Close the shop**).

`npm run dev` runs the API on port 3001 and the Vite front end on port 5173, which proxies `/api` to it.

**It runs with no API keys at all.** Every external service has a fallback: rule-based specials, a cached
or illustrated dish photo, and the browser's built-in voices. So a live demo never breaks on a slow or
missing API.

## Stage controls

| Key | Action |
|---|---|
| `Space` | Close the shop (start the night) |
| `R` | Start over with a new night |
| `V` | Voice-over on or off |

### Voice agent

Switch the top bar from **Manual** to **Voice agent** (Chrome only, since it uses the Web Speech API) and talk to
the kitchen:

- "Close the shop" / "Start over"
- "Set mozzarella to 5 kilos" / "We have 500 grams of garlic"
- "The spinach expires tomorrow" / "The paneer expires in 3 days"
- "Go with the first one, make it spicy" / "Pass on the achari wings"

A rules parser handles these instantly. It tolerates plurals and small mishearings. With ZooWork on, any
sentence the rules don't understand goes to a ZooWork command-interpreter agent. Its answer is checked against
the same name matching before it runs. The agents' messages are read aloud with the browser's
`speechSynthesis`. Each agent has its own voice, and the app stops listening while it talks so it never hears
itself.

## Configuration

Copy `.env.example` to `.env`. Everything is optional.

| Variable | Default | What it does |
|---|---|---|
| `ZOOWORK_API_KEY` | | ZooWork API key |
| `USE_ZOOWORK` | `0` | `1` runs `@chef-assistant` and the voice command interpreter on ZooWork managed agents |
| `CLOUDFLARE_ACCOUNT_ID` | | Cloudflare account for Workers AI dish photos |
| `CLOUDFLARE_API_TOKEN` | | Workers AI token. When both Cloudflare values are set, photos are generated |
| `USE_BAND` | `0` | `1` mirrors agent messages into a Band room (adapter not wired yet, see below) |
| `PUBLIC_URL` | `http://localhost:5173` | Where the QR code points (`<PUBLIC_URL>/order`) |
| `NIGHT_SEED` | random | Replays the same night, for rehearsals. `npm run inventory` prints tonight's seed |
| `CLOSING_DATE` | from seed | Pins tonight's date (`YYYY-MM-DD`) |
| `SPEED` | `1` | Pacing of the night: `0.5` is twice as fast |
| `PORT` | `3001` | API port (and the whole app's port in production) |

## How it fits together

```
 Stage (React)  ◄── Server-Sent Events ──  Express server (server/index.js)
   │  /chef  /order                          │
   └──── POST /api/... ─────────────────────►├─ @pantry          rules        server/agents/pantry.js
                                             ├─ @chef-assistant  ZooWork      server/agents/chefAssistant.js
                                             ├─ @margin-critic   rules        server/agents/marginCritic.js
                                             ├─ chef memory      JSON file    server/memory.js
                                             ├─ menu card        Cloudflare   server/menuCard.js
                                             └─ agent room       Band         server/band.js
```

| Piece | Runs on | Fallback |
|---|---|---|
| **@pantry**: flags expiring and low stock | Rules, because inventory math should be exact | n/a |
| **@chef-assistant**: proposes specials from the restaurant's recipes | ZooWork managed agent | Rule-based recipe matching |
| **@margin-critic**: blocks specials over 32% food cost or well below normal profit | Rules | n/a |
| **Chef approval and memory**: past approvals and passes shape later suggestions | `data/memory.json` | n/a |
| **Menu card**: photo, copy, price, QR, schema.org data | Cloudflare Workers AI (FLUX.1 schnell) | Photo cached per recipe in `data/photos/`, else an illustrated pizza in the special's toppings |
| **Voice commands** | Rules parser, then ZooWork interpreter | Rules only |
| **Voice-over** | Browser `speechSynthesis` | Silent |
| **Agent room** | Band | Stage UI only |

The server keeps one shared night in memory and pushes every change to all open screens over Server-Sent Events.
If a night sits idle for 3 minutes after closing, it starts a fresh one, so a hosted stage never shows a stale night.

## Data: what's real and what's simulated

| Data | Source | File |
|---|---|---|
| **Menu** (the recipe book) | **Real**: Tandoori Pizza, San Jose. Names, listed ingredients, delivery-app prices. Unlisted ingredients and all gram amounts are approximate and marked as such | `data/restaurant-menu.json` |
| **Sales patterns** | **Real**: Maven Analytics "Pizza Place Sales" (which categories sell on which weekday and hour), mapped to the closest menu category | `data/*.csv` (optional, see `data/README.md`) |
| **Shelf life** | **Real**: USDA FoodKeeper refrigerated values. Items FoodKeeper doesn't list use the closest item, marked `"proxy"` | `data/shelf-life.json` |
| **Deliveries, stock, unit costs** | **Simulated**. Expiry = simulated delivery date + USDA shelf life | `data/unit-costs.json`, `server/data.js` |

Only the restaurant's menu text is used. Don't add its logo or food photos to the app.

Without the Maven CSVs, the app uses the dataset's published totals. Without `restaurant-menu.json`, it falls back
to the sample menu in `server/seed.js`.

**A different night every run.** Every server start and every reset builds a new night. The seed picks the
day of the week, delivery dates and stock levels, so different items expire or run low each time. Set
`NIGHT_SEED` to rehearse the same night.

## API

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/events` | Server-Sent Events stream of the night's state |
| `GET` | `/api/state` | Current state |
| `GET` / `POST` | `/api/inventory` | Read or correct tonight's count (`{ items: [{ name, stock?, daysLeft? }] }`) |
| `POST` | `/api/night/start` | Close the shop (`{ auto: true }` auto-approves, as in the booth loop) |
| `POST` | `/api/approve` | Approve a special (`{ id, note? }`) |
| `POST` | `/api/pass` | Pass on a special (`{ id, note? }`) |
| `POST` | `/api/orders` | Place an order for tonight's special (`{ name }`) |
| `POST` | `/api/reset` | New night (`{ forgetChef: true }` also clears the chef's memory) |
| `POST` | `/api/command/interpret` | Turn a spoken sentence into a command with ZooWork |
| `GET` | `/api/special.json` | Tonight's special as schema.org `MenuItem` data, for shopper agents |
| `GET` | `/api/health` | Health check |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API and front end with hot reload |
| `npm run build` | Build the front end into `dist/` |
| `npm start` | Serve the API and the built app on one port |
| `npm run inventory` | Print tonight's seed, what's expiring and what's low |
| `node server/testZoowork.js` | One live call to the ZooWork chef-assistant (the first run creates the agent, which can take a minute) |
| `node server/testImage.js` | Generate one dish photo with Cloudflare and save it as `test-image.*` |

## Putting the QR code on the internet

Phones in the audience need a public URL. Either deploy (`npm run build && npm start` serves everything on port
3001), or build and run a tunnel:

```bash
npm run build && npm start
npx cloudflared tunnel --url http://localhost:3001
```

Then set `PUBLIC_URL` to that URL and restart.

## Wiring up Band

`server/band.js` is a stub. To finish it, paste this into Claude Code:

> Read docs.band.ai and the hacker guide at band.ai/hacker-guide. Implement `postToRoom(handle, text)` in
> `server/band.js` so every agent message is posted into one Band room called "Spoiler Alert kitchen", with
> @pantry, @chef-assistant and @margin-critic as separate seats. Keep the function signature. Don't change other files.

Then set `USE_BAND=1` in `.env`.

## Project structure

```
server/
  index.js            Express app: the night's state machine, routes, SSE
  agents/             pantry.js, chefAssistant.js, marginCritic.js
  data.js             builds each night: menu, sales, shelf life, simulated stock
  menuCard.js         photo, copy, price, QR, schema.org data
  zoowork.js          ZooWork managed agents (chef-assistant, command interpreter)
  cloudflare.js       Workers AI dish photos
  band.js             Band room adapter (stub)
  memory.js           the chef's past decisions
src/
  Stage.jsx           the stage screen
  Chef.jsx, Order.jsx the phone pages
  MenuCard.jsx        the chalkboard card
  commands.js         voice command parser (shared with the server)
  listener.js, voice.js  speech recognition and voice-over
data/                 menu, shelf life, unit costs, optional Maven CSVs, cached photos
```
