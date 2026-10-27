import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../dist/index.js";

const botInfo = {
  id: 123456,
  is_bot: true,
  first_name: "Test Bot",
  username: "test_bot",
};

test("the bundled Worker handles commands and persists per-chat KV sessions", async (t) => {
  const replies = [];
  const values = new Map();
  const kv = {
    async get(key, options) {
      assert.equal(options.type, "json");
      return values.has(key) ? JSON.parse(values.get(key)) : null;
    },
    async put(key, value) {
      values.set(key, value);
    },
    async delete(key) {
      values.delete(key);
    },
  };
  const read = t.mock.method(kv, "get");
  const write = t.mock.method(kv, "put");
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const method = String(input).split("/").pop();
    if (method === "getMe") {
      return Response.json({ ok: true, result: botInfo });
    }
    assert.equal(method, "sendMessage");
    const reply = JSON.parse(init.body);
    replies.push(reply);
    return Response.json({
      ok: true,
      result: {
        message_id: 2,
        date: 0,
        chat: { id: reply.chat_id, type: "private" },
        ...reply,
      },
    });
  });

  let updateId = 0;
  for (const [text, chatId, expected] of [
    ["/start", 42, /Hello! I'm a Telegram bot/],
    ["/ping", 42, /^Pong! 🏓$/],
    ["/help", 42, /This is a simple Telegram bot/],
    ["Hello", 42, /^You said: "Hello"$/],
    ["/language", 42, /^Language preference: en$/],
    ["/language de", 42, /^Language preference: de$/],
    ["/language", 42, /^Language preference: de$/],
    ["/language", 99, /^Language preference: en$/],
    ["/language", 42, /^Language preference: de$/],
  ]) {
    const message = {
      message_id: 1,
      date: 0,
      chat: { id: chatId, type: "private" },
      from: { id: chatId, is_bot: false, first_name: "Test" },
      text,
      ...(text.startsWith("/")
        ? {
            entities: [
              {
                type: "bot_command",
                offset: 0,
                length: text.split(" ")[0].length,
              },
            ],
          }
        : {}),
    };
    const response = await worker.fetch(
      new Request("https://worker.example/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ update_id: ++updateId, message }),
      }),
      { BOT_TOKEN: "123456:test-token", BOT_DATA: kv },
    );

    assert.equal(response.status, 200);
    const reply = replies.at(-1);
    assert.equal(reply.chat_id, chatId);
    assert.match(reply.text, expected);
    // Commands that don't access the lazy session must not read or write KV.
    if (updateId <= 4) {
      assert.equal(read.mock.callCount(), 0);
      assert.equal(write.mock.callCount(), 0);
    }
  }
  assert.equal(replies.length, 9);
  assert.deepEqual(JSON.parse(values.get("42")), { language: "de" });
  assert.deepEqual(JSON.parse(values.get("99")), { language: "en" });
});
