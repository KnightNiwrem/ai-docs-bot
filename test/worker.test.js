import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import worker from "../dist/index.js";

const botInfo = {
  id: 123456,
  is_bot: true,
  first_name: "Docs Bot",
  username: "docs_bot",
};
const env = {
  DOCS_BOT_TOKEN: "123456:test-token",
  KEENABLE_API_KEY: "keen_test",
  DOCS_BOT_WEBHOOK_SECRET: "webhook-secret",
};

const keenableResults = [
  {
    title: "Inline Queries (built-in) | grammY",
    url: "https://grammy.dev/plugins/inline-query.html",
    description: "",
    snippet: "With inline queries,​ users can\n  search for content.",
  },
  {
    title: "InlineQueryResultBuilder | grammY",
    url: "https://grammy.dev/ref/core/inlinequeryresultbuilder",
    description: "Build inline query results.",
    snippet: "ignored because description is set",
  },
  {
    // Same page as the first result, ranked lower.
    title: "Inline Queries (built-in) | grammY",
    url: "https://grammy.dev/plugins/inline-query",
    snippet: "duplicate",
  },
];

let calls;
let keenable;

beforeEach((t) => {
  calls = [];
  keenable = () =>
    Response.json({ query: "", mode: "pro", results: keenableResults });
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const url = String(input);
    const body = JSON.parse(init.body ?? "{}");
    calls.push({ url, headers: init.headers, body });
    if (url.startsWith("https://api.keenable.ai/")) return keenable();
    const method = url.split("/").pop();
    if (method === "getMe") return Response.json({ ok: true, result: botInfo });
    return Response.json({ ok: true, result: true });
  });
});

let updateId = 0;
function post(update, secret = env.DOCS_BOT_WEBHOOK_SECRET) {
  return worker.fetch(
    new Request("https://worker.example/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Telegram-Bot-Api-Secret-Token": secret } : {}),
      },
      body: JSON.stringify({ update_id: ++updateId, ...update }),
    }),
    env,
  );
}

async function send(update) {
  const response = await post(update);
  assert.equal(response.status, 200);
}

function inlineQuery(query) {
  return send({
    inline_query: {
      id: "q1",
      from: { id: 42, is_bot: false, first_name: "Test" },
      query,
      offset: "",
    },
  });
}

function telegramCalls(method) {
  return calls.filter((c) => c.url.endsWith(`/${method}`));
}

test("inline queries are answered with ranked, deduplicated grammy.dev results", async () => {
  await inlineQuery("  inline queries ");

  const [search] = calls.filter((c) =>
    c.url.startsWith("https://api.keenable.ai/"),
  );
  assert.equal(search.url, "https://api.keenable.ai/v1/search");
  assert.equal(search.headers["X-API-Key"], "keen_test");
  assert.equal(search.body.query, "inline queries");
  assert.equal(search.body.site, "grammy.dev");
  assert.equal(search.body.max_results, 25);

  const [answer] = telegramCalls("answerInlineQuery");
  assert.equal(answer.body.inline_query_id, "q1");
  assert.equal(answer.body.next_offset, undefined);
  assert.deepEqual(
    answer.body.results.map(
      ({ id, title, url, description, input_message_content }) => ({
        id,
        title,
        url,
        description,
        text: input_message_content.message_text,
      }),
    ),
    [
      {
        id: "0",
        title: "Inline Queries (built-in)",
        url: "https://grammy.dev/plugins/inline-query",
        description: "With inline queries, users can search for content.",
        text: "Inline Queries (built-in)\nhttps://grammy.dev/plugins/inline-query",
      },
      {
        id: "1",
        title: "InlineQueryResultBuilder",
        url: "https://grammy.dev/ref/core/inlinequeryresultbuilder",
        description: "Build inline query results.",
        text: "InlineQueryResultBuilder\nhttps://grammy.dev/ref/core/inlinequeryresultbuilder",
      },
    ],
  );
});

test("empty inline queries are answered without searching", async () => {
  await inlineQuery("   ");

  assert.equal(
    calls.filter((c) => c.url.startsWith("https://api.keenable.ai/")).length,
    0,
  );
  const [answer] = telegramCalls("answerInlineQuery");
  assert.deepEqual(answer.body.results, []);
});

test("search failures are answered with an uncached empty result", async (t) => {
  t.mock.method(console, "error", () => {});
  keenable = () => new Response("rate limited", { status: 429 });

  await inlineQuery("sessions");

  const [answer] = telegramCalls("answerInlineQuery");
  assert.deepEqual(answer.body.results, []);
  assert.equal(answer.body.cache_time, 0);
});

test("/start explains inline usage", async () => {
  await send({
    message: {
      message_id: 1,
      date: 0,
      chat: { id: 42, type: "private" },
      from: { id: 42, is_bot: false, first_name: "Test" },
      text: "/start",
      entities: [{ type: "bot_command", offset: 0, length: 6 }],
    },
  });

  const [reply] = telegramCalls("sendMessage");
  assert.equal(reply.body.chat_id, 42);
  assert.match(reply.body.text, /@docs_bot/);
  assert.equal(
    reply.body.reply_markup.inline_keyboard[0][0]
      .switch_inline_query_current_chat,
    "",
  );
});

test("webhook requests without the secret token are rejected", async () => {
  const update = {
    inline_query: {
      id: "q1",
      from: { id: 42, is_bot: false, first_name: "Test" },
      query: "sessions",
      offset: "",
    },
  };
  for (const secret of [null, "wrong-secret"]) {
    const response = await post(update, secret);
    assert.equal(response.status, 401);
  }
  assert.equal(calls.filter((c) => !c.url.endsWith("/getMe")).length, 0);
});
