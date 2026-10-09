import { directTransport, serverTransport, TransportError } from "@/src/transport";

const usage = { inputTokens: 10, outputTokens: 5 };

function fakeFetch(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const path = new URL(url).pathname;
    const r = routes[path];
    if (!r) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("server transport", () => {
  it("sends bearer token and returns result + usage", async () => {
    const { fn, calls } = fakeFetch({
      "/v1/config": { body: { autofillEnabled: true, formMapVersion: "x" } },
      "/v1/choose": { body: { result: { choice: "M" }, usage } },
    });
    const t = serverTransport("https://srv.example/", "tok-123456789012345678901234", fn);
    const r = await t.call("choose", { field: "size", attributes: {} as never, options: ["M"] });
    expect(r.result).toEqual({ choice: "M" });
    expect(r.usage).toEqual(usage);
    const headers = calls[1]!.init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-123456789012345678901234");
    expect(calls[1]!.url).toBe("https://srv.example/v1/choose");
  });

  it("respects the remote kill switch", async () => {
    const { fn } = fakeFetch({ "/v1/config": { body: { autofillEnabled: false, formMapVersion: "x" } } });
    const t = serverTransport("https://srv.example", "tok", fn);
    await expect(t.call("rewrite", {} as never)).rejects.toMatchObject({ kind: "disabled" });
  });

  it("maps 401 to an unauthorized error", async () => {
    const { fn } = fakeFetch({ "/v1/config": { status: 401, body: { error: "unauthorized" } } });
    const t = serverTransport("https://srv.example", "bad", fn);
    await expect(t.test()).rejects.toMatchObject({ kind: "unauthorized" });
  });

  it("requires URL and token", () => {
    expect(() => serverTransport("", "tok")).toThrow(TransportError);
    expect(() => serverTransport("https://x", "")).toThrow(TransportError);
  });
});

describe("direct transport", () => {
  it("requires an API key", () => {
    expect(() => directTransport("  ")).toThrowError(/API-Key/);
  });

  it("passes calls to the shared runner with the user's client", async () => {
    const parse = vi.fn(async () => ({ parsed_output: { choice: "M" }, stop_reason: "end_turn", usage: { input_tokens: 3, output_tokens: 1 } }));
    const t = directTransport("sk-ant-x", () => ({ messages: { parse } }) as never);
    const attrs = {
      itemType: "Pullover", categoryPath: [], brand: null, brandEvidence: "none", size: "M", sizeEvidence: "label",
      colors: [], material: null, condition: "gut", defects: [], priceMinEur: 5, priceMaxEur: 9,
    } as never;
    const r = await t.call("choose", { field: "size", attributes: attrs, options: ["S", "M"] });
    expect(r.result.choice).toBe("M");
    expect(parse).toHaveBeenCalledOnce();
  });
});
