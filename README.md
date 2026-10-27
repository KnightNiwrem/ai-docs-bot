# cfw-grammY

A Telegram bot running on Cloudflare Workers using the grammY library.

## Features

- ✨ Built with [grammY](https://grammy.dev/) - The Telegram Bot Framework
- 🚀 Deployed on [Cloudflare Workers](https://workers.cloudflare.com/) for edge computing
- 📦 TypeScript support with proper type definitions
- 🔧 Easy configuration with Wrangler
- 💾 Typed per-chat sessions backed by Cloudflare KV using [grammY's storage adapter](https://github.com/grammyjs/storages)

## Getting Started

### Prerequisites

- Node.js 24.22.1+ within 24.x, or Node.js 26.12.1 or newer. Node.js 24.22.1 is pinned in `.nvmrc`; run `nvm install` then `nvm use` if you use nvm.
- A Telegram Bot Token (get one from [@BotFather](https://t.me/BotFather))
- A Cloudflare account

### Installation

1. Clone this repository:
```bash
git clone https://github.com/KnightNiwrem/cfw-grammY.git
cd cfw-grammY
```

2. Install dependencies:
```bash
npm ci
```

3. Configure your local bot token:
```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and replace the placeholder with your Telegram bot token. This file is ignored by Git. Use a separate bot for development to avoid interfering with your production webhook.

4. Generate Worker types for your editor:
```bash
npm run cf-typegen
```

Types are generated from your Wrangler configuration and compatibility date. Regenerate them after changing bindings or compatibility settings. The generated file is ignored by Git; `typecheck` also regenerates it automatically.

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

`build` checks types and writes the bundle to `dist/`. The tests exercise the bundled Worker with mocked Telegram API responses and do not require real credentials.

Run `npm run fmt` to apply formatting. GitHub Actions runs formatting, lint, type checks, and tests on pull requests and pushes to `main` or `master`, using the Node.js version in `.nvmrc`.

`wrangler dev` uses local KV storage for the `BOT_DATA` binding, so you can develop before creating a remote namespace. Local data is kept under `.wrangler/` and is separate from production data. The tests use an in-memory KV mock to check session persistence and isolation between chats.

### Deployment

Choose your Worker name in `wrangler.toml`, sign in to Cloudflare, and create a KV namespace for your bot's sessions:

```bash
npx wrangler login
npx wrangler kv namespace create BOT_DATA
```

Replace `REPLACE_WITH_YOUR_KV_NAMESPACE_ID` in `wrangler.toml` with the namespace ID returned by that command. If you already have a namespace, use its ID instead. Keep the binding name `BOT_DATA` so it matches `env.BOT_DATA` in the Worker. See [Cloudflare's KV setup guide](https://developers.cloudflare.com/kv/get-started/).

Store your production bot token as a secret:

```bash
npx wrangler secret put BOT_TOKEN
```

Then deploy to Cloudflare Workers:
```bash
npm run deploy
```

Wrangler bundles the TypeScript source during deployment and connects `BOT_DATA` to your configured KV namespace.

### Setting up the Webhook

After deployment, set up the webhook for your bot:
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://your-worker.your-subdomain.workers.dev"}'
```

## Bot Commands

- `/start` - Welcome message and available commands
- `/ping` - Test if the bot is responsive
- `/help` - Show help information
- `/language [code]` - View or save a language preference for this chat, for example `/language de`

The bot also echoes back any text messages sent to it.

## Building on the session template

`SessionData` in `src/index.ts` defines your per-chat state. Extend it with fields your bot needs and provide their defaults in `lazySession({ initial: ... })`. In a handler, use `const session = await ctx.session`, then read or modify its fields. grammY loads and saves the data through `KvAdapter` and `env.BOT_DATA`; the default session key is the chat ID. Handlers that never access `ctx.session` perform no session reads or writes.

The `/language` command demonstrates a preference that survives separate webhook requests. It stores a preference only; add your own translation logic when building your bot.

KV is [eventually consistent](https://developers.cloudflare.com/kv/concepts/how-kv-works/) and [limits writes to the same key to once per second](https://developers.cloudflare.com/kv/platform/limits/). This scaffold suits low-frequency preferences; session updates are not atomic, so account for these limits when adding frequently changing or concurrent state.

## Project Structure

```
├── src/
│   └── index.ts          # Main worker entry point
├── test/
│   └── worker.test.js    # Bundled Worker smoke test
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
