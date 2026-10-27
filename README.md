# grammY Docs Bot

A Telegram inline bot that searches the [grammY documentation](https://grammy.dev/). Type `@your_bot <question>` in any chat, and the bot lists the most relevant grammy.dev pages, ranked by relevance, as articles you can send.

## Features

- 🔎 Web search scoped to grammy.dev, powered by the [Keenable search API](https://docs.keenable.ai/api-reference/search)
- ✨ Built with [grammY](https://grammy.dev/) - The Telegram Bot Framework
- 🚀 Deployed on [Cloudflare Workers](https://workers.cloudflare.com/), with no storage bindings required
- 📦 TypeScript support with proper type definitions

## Getting Started

### Prerequisites

- Node.js 24.22.1+ within 24.x, or Node.js 26.12.1 or newer. Node.js 24.22.1 is pinned in `.nvmrc`; run `nvm install` then `nvm use` if you use nvm.
- A Telegram Bot Token (get one from [@BotFather](https://t.me/BotFather)) with inline mode enabled (`/setinline` in @BotFather)
- A [Keenable API key](https://app.keenable.ai/console) (recommended; see [Search configuration](#search-configuration))
- A Cloudflare account

### Installation

1. Clone this repository:
```bash
git clone <your-repository-url>
cd ai-docs-bot
```

2. Install dependencies:
```bash
npm ci
```

3. Configure your local credentials:
```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and set `DOCS_BOT_TOKEN` to your Telegram bot token and `KEENABLE_API_KEY` to your Keenable API key. This file is ignored by Git. Use a separate bot for development to avoid interfering with your production webhook.

4. Generate Worker types for your editor:
```bash
npm run cf-typegen
```

Types are generated from your Wrangler configuration and compatibility date. Regenerate them after changing compatibility settings. The generated file is ignored by Git; `typecheck` also regenerates it automatically.

### Development

Run the development server:
```bash
npm run dev
```

Wrangler builds directly from `src/index.ts`, so no separate build is needed. The local endpoint is `http://localhost:8787`. Telegram requires a publicly reachable HTTPS webhook; use an HTTPS tunnel to forward requests to your local endpoint when testing with Telegram.

Run the project checks or create a deployment bundle without publishing it:

```bash
npm run fmt:check
npm run lint
npm run typecheck
npm run build
npm test
```

`build` checks types and writes the bundle to `dist/`. The tests exercise the bundled Worker with mocked Telegram and Keenable API responses and do not require real credentials.

Run `npm run fmt` to apply formatting. GitHub Actions runs formatting, lint, type checks, and tests on pull requests and pushes to `main` or `master`, using the Node.js version in `.nvmrc`.

### Deployment

Choose your Worker name in `wrangler.toml` and sign in to Cloudflare:

```bash
npx wrangler login
```

Store your production bot token, Keenable API key, and webhook secret as secrets:

```bash
npx wrangler secret put DOCS_BOT_TOKEN
npx wrangler secret put KEENABLE_API_KEY
npx wrangler secret put DOCS_BOT_WEBHOOK_SECRET
```

`DOCS_BOT_WEBHOOK_SECRET` can be any string of 1-256 letters, digits, `_`, or `-`, for example the output of `openssl rand -hex 32`. When it is set, the Worker rejects requests that don't carry it in the `X-Telegram-Bot-Api-Secret-Token` header with `401`, so only Telegram can deliver updates.

Then deploy to Cloudflare Workers:
```bash
npm run deploy
```

Wrangler bundles the TypeScript source during deployment.

### Setting up the Webhook

After deployment, set up the webhook for your bot, passing the same webhook secret as `secret_token`:
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://your-worker.your-subdomain.workers.dev", "secret_token": "<YOUR_WEBHOOK_SECRET>", "allowed_updates": ["message", "inline_query"]}'
```

If you change `DOCS_BOT_WEBHOOK_SECRET`, call `setWebhook` again with the new value. Until you do, Telegram's requests are rejected.

## Usage

- In any chat, type `@your_bot` followed by a search query, such as `@your_bot session storage`, then pick a result to send a link to that page. The message shows the page title in bold, then the URL, and opens as an [Instant View](https://instantview.telegram.org/) page using the same IV template as [@grammYdocsbot](https://github.com/grammyjs/docs-bot).
- `/start` or `/help` in a private chat explains this and offers a button that starts an inline search.

## Search configuration

Each non-empty inline query triggers one [Keenable search](https://docs.keenable.ai/api-reference/search) restricted to `grammy.dev`. The bot requests the top 25 results. Keenable reports no relevance score, only rank order, and lower-ranked results of a 50-result search are often off-topic. To change the count, edit `MAX_RESULTS` in `src/index.ts`. Up to 50 results fit in one inline answer, so every search fits on one page and pagination is never needed. Results keep Keenable's relevance order. The bot drops duplicate pages, such as `/plugins/router.html` and `/plugins/router`, removes the ` | grammY` title suffix, and uses the page snippet as the article description. Search results can include translated pages, such as `/zh/...`, when they match the query.

`KEENABLE_API_KEY` is optional. Without it, the bot uses Keenable's keyless public endpoint, which is limited to 1,000 requests per hour per IP address. Cloudflare Workers share outbound IP addresses, so that limit is shared with unrelated traffic. Set a key for anything beyond a quick trial; see [Keenable's rate limits](https://docs.keenable.ai/rate-limits) and [credits](https://docs.keenable.ai/credits).

If a search fails, the bot logs the error and answers with no results and `cache_time: 0`, so Telegram doesn't cache the empty answer.

## Project Structure

```
├── src/
│   └── index.ts          # Main worker entry point
├── test/
│   └── worker.test.js    # Bundled Worker tests
├── .dev.vars.example    # Local secret configuration example
├── .nvmrc               # Recommended Node.js version
├── package.json          # Dependencies and scripts
├── package-lock.json     # Reproducible dependency versions
├── tsconfig.json         # TypeScript configuration
├── wrangler.toml         # Cloudflare Workers configuration
└── README.md            # This file
```

## License

MIT License - see [LICENSE](LICENSE) file for details.
