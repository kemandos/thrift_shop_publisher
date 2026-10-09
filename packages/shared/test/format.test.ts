import { describe, expect, it } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { Condition } from "../src";

describe("structured output format", () => {
  it("builds a JSON schema from our model-facing zod schema", () => {
    const S = z.object({ size: z.string().nullable(), condition: Condition, colors: z.array(z.string()) });
    const f = zodOutputFormat(S) as unknown as { type: string; schema: Record<string, unknown> };
    expect(f.type).toBe("json_schema");
    expect(JSON.stringify(f.schema)).toContain("sehr_gut");
  });
});
