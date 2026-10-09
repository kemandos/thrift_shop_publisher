import { z } from "zod";
import { FormMap } from "./formMap";

/**
 * HTTP contract between the extension (server mode) and the optional own server.
 * All AI endpoints: POST JSON body = the request schema, response = { result, usage }.
 * Auth: `Authorization: Bearer <token>`.
 */
export const API_PATHS = {
  analyze: "/v1/analyze",
  rewrite: "/v1/rewrite",
  choose: "/v1/choose",
  pickElement: "/v1/pick-element",
  formMap: "/v1/form-map",
  config: "/v1/config",
  health: "/v1/health",
  usage: "/v1/usage",
} as const;

export const ServerConfig = z.object({
  /** Remote kill switch: when false the extension must not fill. */
  autofillEnabled: z.boolean(),
  formMapVersion: z.string(),
});
export type ServerConfig = z.infer<typeof ServerConfig>;

export const FormMapResponse = z.object({ formMap: FormMap });

export const ApiError = z.object({ error: z.string(), kind: z.string().optional() });
export type ApiError = z.infer<typeof ApiError>;
