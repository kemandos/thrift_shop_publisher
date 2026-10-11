import { openRouterTransport, serverTransport, TransportError } from "@/src/transport";

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

describe("openrouter transport with Microsoft Decision-1 for navigation", () => {
  const attrs = {
    itemType: "Shorts", categoryPath: ["Damen", "Kleidung", "Shorts"], brand: null, brandEvidence: "none", size: "M",
    sizeEvidence: "label", colors: ["Beige"], material: "Baumwolle", condition: "gut", defects: [], features: ["hohe Taille"],
    priceMinEur: 5, priceMaxEur: 9,
  } as never;
  const models = { model: "anthropic/claude-haiku-5.5", navModel: "microsoft/microsoft-decision-1" };

  it("asks the Decisions API and maps the chosen key back to the option", async () => {
    const calls: Array<{ url: string; body: any }> = [];
    const fn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(init!.body as string) });
      return new Response(
        JSON.stringify({
          model: "microsoft/microsoft-decision-1-20261009",
          answers: { pick: { type: "choice", choice: "o2", confidence: 0.91 } },
          usage: { input_tokens: 128, output_tokens: 1, cost: 0.000005376 },
        }),
      );
    }) as unknown as typeof fetch;
    const t = openRouterTransport("sk-or-x", models, fn);
    const r = await t.call("choose", {
      field: "category",
      mode: "tree",
      attributes: attrs,
      context: "Beige Shorts mit hoher Taille",
      options: ["Röcke", "Shorts"],
    });
    expect(r.result.choice).toBe("Shorts");
    expect(r.usage).toEqual({ inputTokens: 128, outputTokens: 1, costUsd: 0.000005376 });
    expect(calls[0]!.url).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(calls[0]!.body.model).toBe("microsoft/microsoft-decision-1");
    expect(calls[0]!.body.questions.pick.type).toBe("choice");
    expect(calls[0]!.body.questions.pick.criteria).toEqual({ o1: "Röcke", o2: "Shorts" }); // tree level: no "none"
    expect(calls[0]!.body.state.item.type).toBe("Shorts");
    expect(calls[0]!.body.state.listing).toBe("Beige Shorts mit hoher Taille");
    expect(calls[0]!.body.state.item.features).toEqual(["hohe Taille"]); // what Haiku saw on the photos
  });

  it("acts only on confident answers; 'none' and low confidence leave the field open", async () => {
    const reply = (choice: string, confidence: number) =>
      (async () => new Response(JSON.stringify({ answers: { pick: { type: "choice", choice, confidence } }, usage: { input_tokens: 1, output_tokens: 1 } }))) as unknown as typeof fetch;
    const ask = (f: typeof fetch) =>
      openRouterTransport("sk-or-x", models, f).call("choose", { field: "other", fieldLabel: "Rocklänge", attributes: attrs, options: ["Mini", "Midi"] });
    expect((await ask(reply("o1", 0.82))).result.choice).toBe("Mini");
    expect((await ask(reply("o1", 0.41))).result.choice).toBeNull();
    expect((await ask(reply("none", 0.95))).result.choice).toBeNull();
  });

  it("falls back to the text model when the Decisions API fails", async () => {
    const urls: string[] = [];
    const fn = (async (url: string) => {
      urls.push(url);
      if (url.includes("/alpha/decisions")) return new Response("{}", { status: 503 });
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify({ choice: "Gut" }) }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 1 } }),
      );
    }) as unknown as typeof fetch;
    const r = await openRouterTransport("sk-or-x", models, fn).call("choose", { field: "condition", attributes: attrs, options: ["Sehr gut", "Gut"] });
    expect(r.result.choice).toBe("Gut");
    expect(urls[1]).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("finds renamed fields with the decision model too", async () => {
    const fn = (async () =>
      new Response(JSON.stringify({ answers: { pick: { type: "choice", choice: "e2", confidence: 0.88 } }, usage: { input_tokens: 5, output_tokens: 1 } }))) as unknown as typeof fetch;
    const r = await openRouterTransport("sk-or-x", models, fn).call("pickElement", {
      goal: "Zustand",
      elements: [
        { id: "e1", role: "input", label: "Titel", text: "" },
        { id: "e2", role: "combobox", label: "Artikelzustand", text: "" },
      ],
    });
    expect(r.result.id).toBe("e2");
  });
});

describe("thinking switch", () => {
  const attrs = {
    itemType: "Shorts", categoryPath: [], brand: null, brandEvidence: "none", size: null, sizeEvidence: "none",
    colors: [], material: null, condition: "gut", defects: [], features: [], priceMinEur: 5, priceMaxEur: 9,
  } as never;
  const bodies: any[] = [];
  const fn = (async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(init!.body as string));
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ title: "Shorts", description: "Beige Shorts.", hashtags: [] }) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
    );
  }) as unknown as typeof fetch;
  const style = { language: "de", tone: "freundlich", closingText: "" } as const;

  it("is off by default and applies to every chat model (Haiku, Qwen)", async () => {
    for (const model of ["anthropic/claude-haiku-5.5", "qwen/qwen3.7-flash"]) {
      await openRouterTransport("sk-or-x", { model, navModel: "microsoft/microsoft-decision-1" }, fn).call("rewrite", { attributes: attrs, style });
      expect(bodies.at(-1).reasoning).toEqual({ enabled: false });
      expect(bodies.at(-1).model).toBe(model);
      expect(bodies.at(-1).provider).toEqual({ require_parameters: true, sort: "price" });
    }
    await openRouterTransport("sk-or-x", { model: "qwen/qwen3.7-flash", navModel: "anthropic/claude-haiku-5.5", thinking: true }, fn).call("rewrite", {
      attributes: attrs,
      style,
    });
    expect(bodies.at(-1).reasoning).toEqual({ enabled: true });
  });
});

describe("openrouter transport", () => {
  const models = { model: "anthropic/claude-haiku-5.5", navModel: "qwen/qwen3.7-flash" };
  it("requires a key", () => {
    expect(() => openRouterTransport("  ", models)).toThrowError(/OpenRouter-Key/);
  });

  it("routes option choosing to the navigation model (Jev) and returns cost", async () => {
    const calls: Array<{ url: string; body: { model: string } }> = [];
    const fn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(init!.body as string) });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ choice: "M" }) }, finish_reason: "stop" }],
          usage: { prompt_tokens: 3, completion_tokens: 1, cost: 0.00001 },
        }),
      );
    }) as unknown as typeof fetch;
    const t = openRouterTransport("sk-or-x", models, fn);
    const attrs = {
      itemType: "Pullover", categoryPath: [], brand: null, brandEvidence: "none", size: "M", sizeEvidence: "label",
      colors: [], material: null, condition: "gut", defects: [], priceMinEur: 5, priceMaxEur: 9,
    } as never;
    const r = await t.call("choose", { field: "size", attributes: attrs, options: ["S", "M"] });
    expect(r.result.choice).toBe("M");
    expect(r.usage.costUsd).toBe(0.00001);
    expect(calls[0]!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(calls[0]!.body.model).toBe("qwen/qwen3.7-flash");
    await t.call("rewrite", { attributes: attrs, style: { language: "de", tone: "freundlich", closingText: "" } }).catch(() => {});
    expect(calls[1]!.body.model).toBe("anthropic/claude-haiku-5.5");
  });

  it("reads the OpenRouter balance (credits − usage), falls back to the key limit", async () => {
    const credits = (async (url: string) =>
      new Response(JSON.stringify(url.endsWith("/credits") ? { data: { total_credits: 10, total_usage: 2.5 } } : {}))) as unknown as typeof fetch;
    expect(await openRouterTransport("sk-or-x", models, credits).balance()).toEqual({ remainingUsd: 7.5, source: "credits" });
    const keyOnly = (async (url: string) =>
      url.endsWith("/credits")
        ? new Response("{}", { status: 403 })
        : new Response(JSON.stringify({ data: { limit_remaining: 1.25 } }))) as unknown as typeof fetch;
    expect(await openRouterTransport("sk-or-x", models, keyOnly).balance()).toEqual({ remainingUsd: 1.25, source: "key-limit" });
    const none = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    expect(await openRouterTransport("sk-or-x", models, none).balance()).toBeNull();
    expect(await serverTransport("https://srv.example", "tok").balance()).toBeNull();
  });

  it("test() checks the key against OpenRouter", async () => {
    const bad = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    await expect(openRouterTransport("sk-or-bad", models, bad).test()).rejects.toMatchObject({ kind: "unauthorized" });
    const good = (async () => new Response(JSON.stringify({ data: {} }))) as unknown as typeof fetch;
    await expect(openRouterTransport("sk-or-ok", models, good).test()).resolves.toBeUndefined();
  });
});
