import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getQuoteExtractionEnvironment,
  getQuoteExtractionModel,
} from "./quote-extraction";
import {
  getItemExtractionEnvironment,
  getItemExtractionModel,
} from "./item-extraction";
import {
  getClientDocumentExtractionEnvironment,
  getClientDocumentExtractionModel,
} from "./client-document-extraction";

const capabilities = [
  {
    variable: "QUOTE_EXTRACTION_MODEL",
    getModel: getQuoteExtractionModel,
    getEnvironmentModel: (override?: string) =>
      getQuoteExtractionEnvironment(override).QUOTE_EXTRACTION_MODEL,
  },
  {
    variable: "ITEM_EXTRACTION_MODEL",
    getModel: getItemExtractionModel,
    getEnvironmentModel: (override?: string) =>
      getItemExtractionEnvironment(override).ITEM_EXTRACTION_MODEL,
  },
  {
    variable: "CLIENT_DOCUMENT_EXTRACTION_MODEL",
    getModel: getClientDocumentExtractionModel,
    getEnvironmentModel: (override?: string) =>
      getClientDocumentExtractionEnvironment(override)
        .CLIENT_DOCUMENT_EXTRACTION_MODEL,
  },
] as const;

afterEach(() => vi.unstubAllEnvs());

describe.each(capabilities)("$variable", (capability) => {
  it.each([
    undefined,
    "",
    "  ",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.6-sol",
  ])("resolves missing or retired default %s to GPT-6 Luna", (model) => {
    vi.stubEnv("OPENAI_API_KEY", "test-only-key");
    vi.stubEnv(capability.variable, model);
    expect(capability.getModel()).toBe("gpt-6-luna");
    expect(capability.getEnvironmentModel()).toBe("gpt-6-luna");
  });

  it.each(["gpt-6-luna", "gpt-6.1-sol", "deployment:model-2026"])(
    "preserves explicitly configured model %s",
    (model) => {
      vi.stubEnv("OPENAI_API_KEY", "test-only-key");
      vi.stubEnv(capability.variable, ` ${model} `);
      expect(capability.getModel()).toBe(model);
      expect(capability.getEnvironmentModel()).toBe(model);
    },
  );

  it("uses the saved model override without validating a superseded environment default", () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only-key");
    vi.stubEnv(capability.variable, "invalid model");
    expect(capability.getEnvironmentModel("gpt-6.1-sol")).toBe("gpt-6.1-sol");
    expect(() => capability.getModel()).toThrow();
  });
});
