import {
  Bot,
  InlineKeyboard,
  InlineQueryResultBuilder,
  webhookCallback,
} from "grammy";
import type { InlineQueryResultArticle, MessageEntity } from "grammy/types";

export interface Env {
  DOCS_BOT_TOKEN: string;
  // Optional. Without a key, the shared per-IP public endpoint is used.
  KEENABLE_API_KEY?: string;
  // Optional. When set, requests without a matching
  // X-Telegram-Bot-Api-Secret-Token header are rejected with 401.
  DOCS_BOT_WEBHOOK_SECRET?: string;
}

const DOCS_SITE = "grammy.dev";
const KEENABLE_URL = "https://api.keenable.ai/v1/search";
// Keenable has no relevance score, only rank order, and the lower-ranked pages
// of a 50-result search are often off-topic, so keep only the top results.
// Anything up to 50 fits in one answerInlineQuery call, so there is no paging.
const MAX_RESULTS = 25;
const KEENABLE_TIMEOUT_MS = 5000;
// Instant View template for grammy.dev, the same one @grammYdocsbot uses:
// https://github.com/grammyjs/docs-bot/blob/main/iv-rules.txt
const IV_RHASH = "d32ab671cec0eb";
const ZWSP = "\u200b";

interface KeenableResult {
  title: string;
  url: string;
  description?: string;
  snippet?: string;
}

async function searchDocs(
  query: string,
  apiKey: string | undefined,
): Promise<KeenableResult[]> {
  const response = await fetch(
    apiKey ? KEENABLE_URL : `${KEENABLE_URL}/public`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // The public endpoint requires an app identifier instead of a key.
        ...(apiKey
          ? { "X-API-Key": apiKey }
          : { "X-Keenable-Title": "grammY docs bot" }),
      },
      body: JSON.stringify({
        query,
        site: DOCS_SITE,
        max_results: MAX_RESULTS,
        snippet_max_length: 180,
      }),
      signal: AbortSignal.timeout(KEENABLE_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Keenable search failed: ${response.status} ${await response.text()}`,
    );
  }
  const { results } = (await response.json()) as { results: KeenableResult[] };
  return results;
}

// Like @grammYdocsbot, send the title in bold, followed by an invisible
// zero-width space that links to the Instant View page, so that Telegram shows
// the IV preview, and then the plain URL on its own line.
function toMessage(title: string, url: string) {
  return {
    text: `${title}${ZWSP}\n\n${url}`,
    entities: [
      { type: "bold", offset: 0, length: title.length },
      {
        type: "text_link",
        offset: title.length,
        length: ZWSP.length,
        url: `https://t.me/iv?rhash=${IV_RHASH}&url=${encodeURIComponent(url)}`,
      },
    ] satisfies MessageEntity[],
  };
}

// grammy.dev serves every page both with and without `.html`, and Keenable
// indexes both, so normalize URLs and keep the first (highest-ranked) match.
function toArticles(results: KeenableResult[]): InlineQueryResultArticle[] {
  const seen = new Set<string>();
  const articles: InlineQueryResultArticle[] = [];
  for (const result of results) {
    const url = new URL(result.url);
    url.pathname = url.pathname.replace(/\.html$/, "");
    const key = `${url.origin}${url.pathname.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const title = result.title.replace(/\s*\|\s*grammY$/, "") || result.title;
    const description = (result.description || result.snippet || "")
      .replace(/​/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const { text, entities } = toMessage(title, url.href);
    articles.push(
      InlineQueryResultBuilder.article(String(articles.length), title, {
        url: url.href,
        description,
      }).text(text, { entities }),
    );
  }
  return articles;
}

function createBot(env: Env): Bot {
  const bot = new Bot(env.DOCS_BOT_TOKEN);

  bot.command(["start", "help"], async (ctx) => {
    await ctx.reply(
      "I search the grammY documentation at grammy.dev.\n\n" +
        `Type @${ctx.me.username} followed by your question in any chat, ` +
        "then pick a page to share it.",
      {
        reply_markup: new InlineKeyboard().switchInlineCurrent(
          "Search the docs",
        ),
      },
    );
  });

  bot.on("inline_query", async (ctx) => {
    const query = ctx.inlineQuery.query.trim();
    if (!query) {
      await ctx.answerInlineQuery([]);
      return;
    }
    try {
      const results = await searchDocs(query, env.KEENABLE_API_KEY);
      await ctx.answerInlineQuery(toArticles(results));
    } catch (error) {
      console.error("Docs search error:", error);
      // Don't let Telegram cache an empty answer caused by a transient failure.
      await ctx.answerInlineQuery([], { cache_time: 0 });
    }
  });

  return bot;
}

// Reuse the bot across requests in the same isolate so that grammY only calls
// getMe once, instead of adding a round trip to every inline query.
let handleUpdate: ((request: Request) => Promise<Response>) | undefined;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      handleUpdate ??= webhookCallback(createBot(env), "cloudflare-mod", {
        secretToken: env.DOCS_BOT_WEBHOOK_SECRET,
      });
      return await handleUpdate(request);
    } catch (error) {
      console.error("Worker error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
