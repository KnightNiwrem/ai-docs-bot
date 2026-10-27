import { KvAdapter } from "@grammyjs/storage-cloudflare";
import { Bot, lazySession, webhookCallback } from "grammy";
import type { Context, LazySessionFlavor } from "grammy";

// Extend this interface with the per-chat state your bot needs.
export interface SessionData {
  language: string;
}

type BotContext = Context & LazySessionFlavor<SessionData>;

export interface Env {
  BOT_TOKEN: string;
  BOT_DATA: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      // Initialize the bot with the token from environment variables
      const bot = new Bot<BotContext>(env.BOT_TOKEN);

      // Load and save per-chat state only when a handler accesses ctx.session.
      bot.use(
        lazySession({
          initial: (): SessionData => ({ language: "en" }),
          storage: new KvAdapter<SessionData>(env.BOT_DATA),
        }),
      );

      // Set up basic bot commands
      bot.command("start", async (ctx) => {
        await ctx.reply(
          "Hello! I'm a Telegram bot running on Cloudflare Workers using grammY! 🤖\n\n" +
            "Available commands:\n" +
            "/start - Show this message\n" +
            "/ping - Ping the bot\n" +
            "/help - Show help information\n" +
            "/language [code] - View or set the chat's language preference",
        );
      });

      bot.command("ping", async (ctx) => {
        await ctx.reply("Pong! 🏓");
      });

      bot.command("help", async (ctx) => {
        await ctx.reply(
          "This is a simple Telegram bot built with grammY and running on Cloudflare Workers.\n\n" +
            "Commands:\n" +
            "/start - Welcome message\n" +
            "/ping - Test if the bot is responsive\n" +
            "/help - This help message\n" +
            "/language [code] - View or set the chat's language preference",
        );
      });

      // A small example of reading and updating persistent session data.
      bot.command("language", async (ctx) => {
        const session = await ctx.session;
        const language = ctx.match.trim();
        if (language) session.language = language;
        await ctx.reply(`Language preference: ${session.language}`);
      });

      // Handle any text message
      bot.on("message:text", async (ctx) => {
        const text = ctx.message.text;
        await ctx.reply(`You said: "${text}"`);
      });

      // Create webhook callback for Cloudflare Workers
      const handleUpdate = webhookCallback(bot, "cloudflare-mod");

      // Handle the request
      return await handleUpdate(request);
    } catch (error) {
      console.error("Worker error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
