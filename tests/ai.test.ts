import { describe, expect, it } from "vitest";
import { AiError, createClaudeWriter } from "../server/services/ai";
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
