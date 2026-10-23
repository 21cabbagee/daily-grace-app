import { describe, expect, it } from "vitest";
import { AiError, createClaudeWriter, createOpenAICompatibleWriter, createWriterFromEnv } from "../server/services/ai";
import { fakeDevotional } from "./helpers";

function stubFetch(content: unknown, stopReason = "end_turn") {
  const requests: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    requests.push({ url: String(url), body: JSON.parse(String(init.body)), headers: new Headers(init.headers) });
    return new Response(
      JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [{ type: "text", text: JSON.stringify(content) }],
        stop_reason: stopReason,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;
  return { fetchFn, requests };
}

describe("Claude writer (network stubbed)", () => {
  it("sends a structured-output request and parses the devotional", async () => {
    const { fetchFn, requests } = stubFetch(fakeDevotional());
    const writer = createClaudeWriter("sk-ant-test", "claude-opus-5-5", { fetch: fetchFn });
    const out = await writer.writeDevotional({ reference: "Philippians 4:6-7", verseText: "In nothing be anxious…", denomination: "Baptist" });
    expect(out.insights).toHaveLength(3);

    const req = requests[0];
    expect(req.url).toContain("/v1/messages");
    expect(req.body.model).toBe("claude-opus-5-5");
    expect(req.body.fallbacks).toBe("default");
    expect(req.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    const outputConfig = req.body.output_config as { effort: string; format: { type: string } };
    expect(outputConfig.effort).toBe("medium");
    expect(outputConfig.format.type).toBe("json_schema");
    expect(JSON.stringify(req.body.messages)).toContain("Philippians 4:6-7");
  });

  it("rejects refusals and malformed devotionals", async () => {
    const refused = createClaudeWriter("k", "claude-opus-5-5", { fetch: stubFetch(fakeDevotional(), "refusal").fetchFn });
    await expect(refused.writeDevotional({ reference: "x", verseText: "y" })).rejects.toBeInstanceOf(AiError);

    const short = createClaudeWriter("k", "claude-opus-5-5", { fetch: stubFetch({ ...fakeDevotional(), insights: [] }).fetchFn });
    await expect(short.writeDevotional({ reference: "x", verseText: "y" })).rejects.toThrow(/three insights/);
  });

  it("parses prayer suggestions", async () => {
    const { fetchFn } = stubFetch({ suggestions: [{ topic: "Rest", prompt: "Ask God for rest tonight." }] });
    const writer = createClaudeWriter("k", "claude-opus-5-5", { fetch: fetchFn });
    expect(await writer.suggestPrayerTopics({ period: "evening", recentCategoryCounts: { praise: 1 }, answeredRecently: 0 })).toEqual([
      { topic: "Rest", prompt: "Ask God for rest tonight." },
    ]);
  });
});

describe("OpenAI-compatible writer (Ollama / Groq / Gemini)", () => {
  function stubChat(content: string, finish = "stop", status = 200) {
    const requests: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      requests.push({ url: String(url), body: JSON.parse(String(init.body)), headers: new Headers(init.headers) });
      return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }] }), { status });
    }) as unknown as typeof fetch;
    return { fetchFn, requests };
  }

  it("requests JSON mode with the schema in the prompt and validates the result", async () => {
    const { fetchFn, requests } = stubChat("```json\n" + JSON.stringify(fakeDevotional()) + "\n```");
    const writer = createOpenAICompatibleWriter("http://localhost:11434/v1/", "llama3.1:8b", undefined, { fetch: fetchFn });
    const out = await writer.writeDevotional({ reference: "Psalm 23:1", verseText: "Yahweh is my shepherd" });
    expect(out.insights).toHaveLength(3);
    expect(requests[0].url).toBe("http://localhost:11434/v1/chat/completions");
    expect(requests[0].body.model).toBe("llama3.1:8b");
    expect(requests[0].body.response_format).toEqual({ type: "json_object" });
    expect(requests[0].headers.get("authorization")).toBeNull();
    expect(JSON.stringify(requests[0].body.messages)).toContain("openingReflection");
  });

  it("sends the API key when one is configured", async () => {
    const { fetchFn, requests } = stubChat(JSON.stringify({ suggestions: [{ topic: "Rest", prompt: "Pray for rest." }] }));
    const writer = createOpenAICompatibleWriter("https://api.groq.com/openai/v1", "llama-3.3-70b-versatile", "gsk_test", { fetch: fetchFn });
    await writer.suggestPrayerTopics({ period: "evening", recentCategoryCounts: {}, answeredRecently: 0 });
    expect(requests[0].headers.get("authorization")).toBe("Bearer gsk_test");
  });

  it("classifies failures as retryable or not", async () => {
    const malformed = createOpenAICompatibleWriter("http://x/v1", "m", undefined, { fetch: stubChat("not json").fetchFn });
    await expect(malformed.writeDevotional({ reference: "x", verseText: "y" })).rejects.toMatchObject({ retryable: true });
    const wrongShape = createOpenAICompatibleWriter("http://x/v1", "m", undefined, { fetch: stubChat('{"title":"x"}').fetchFn });
    await expect(wrongShape.writeDevotional({ reference: "x", verseText: "y" })).rejects.toMatchObject({ retryable: true });
    const busy = createOpenAICompatibleWriter("http://x/v1", "m", undefined, { fetch: stubChat("{}", "stop", 429).fetchFn });
    await expect(busy.writeDevotional({ reference: "x", verseText: "y" })).rejects.toMatchObject({ retryable: true });
    const unauthorized = createOpenAICompatibleWriter("http://x/v1", "m", undefined, { fetch: stubChat("{}", "stop", 401).fetchFn });
    await expect(unauthorized.writeDevotional({ reference: "x", verseText: "y" })).rejects.toMatchObject({ retryable: false });
  });

  it("picks the provider from env", () => {
    expect(createWriterFromEnv({ ANTHROPIC_MODEL: "claude-opus-5-5" }).model).toBe("unconfigured");
    expect(createWriterFromEnv({ ANTHROPIC_MODEL: "claude-opus-5-5", AI_BASE_URL: "http://localhost:11434/v1", AI_MODEL: "llama3.1:8b" }).model).toBe("llama3.1:8b");
    expect(createWriterFromEnv({ ANTHROPIC_MODEL: "claude-opus-5-5", ANTHROPIC_API_KEY: "sk" }).model).toBe("claude-opus-5-5");
    expect(() => createWriterFromEnv({ ANTHROPIC_MODEL: "c", AI_BASE_URL: "http://x/v1" })).toThrow(/AI_MODEL/);
  });
});
