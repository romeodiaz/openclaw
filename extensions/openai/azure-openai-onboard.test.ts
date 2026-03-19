import { describe, expect, it } from "vitest";
import {
  AZURE_OPENAI_API_VERSION_PARAM,
  applyAzureOpenAIConfig,
  normalizeAzureOpenAIBaseUrl,
} from "./azure-openai-onboard.js";

describe("azure-openai-onboard", () => {
  describe("normalizeAzureOpenAIBaseUrl", () => {
    it("normalizes Azure resource URLs to /openai/v1", () => {
      expect(normalizeAzureOpenAIBaseUrl("https://example.openai.azure.com")).toBe(
        "https://example.openai.azure.com/openai/v1",
      );
      expect(
        normalizeAzureOpenAIBaseUrl(
          "https://example.services.ai.azure.com/openai/deployments/gpt-5.4?api-version=2025-04-01-preview#frag",
        ),
      ).toBe("https://example.services.ai.azure.com/openai/v1");
      expect(
        normalizeAzureOpenAIBaseUrl("https://example.cognitiveservices.azure.com/openai/v1"),
      ).toBe("https://example.cognitiveservices.azure.com/openai/v1");
    });

    it("rejects insecure or non-Azure URLs", () => {
      expect(() => normalizeAzureOpenAIBaseUrl("http://example.openai.azure.com")).toThrow("https");
      expect(() => normalizeAzureOpenAIBaseUrl("https://example.com")).toThrow(
        "Azure OpenAI or Azure AI Foundry hostname",
      );
    });
  });

  describe("applyAzureOpenAIConfig", () => {
    it("writes provider config, default model, and preview api version", () => {
      const next = applyAzureOpenAIConfig(
        {},
        {
          baseUrl: "https://example.openai.azure.com/openai/deployments/gpt-5.4",
          modelId: " gpt-5.4 ",
          apiVersion: "2025-04-01-preview",
        },
      );

      expect(next.agents?.defaults?.model).toEqual({
        primary: "azure-openai-responses/gpt-5.4",
      });
      expect(next.models?.providers?.["azure-openai-responses"]).toEqual(
        expect.objectContaining({
          baseUrl: "https://example.openai.azure.com/openai/v1",
          api: "azure-openai-responses",
        }),
      );
      expect(next.models?.providers?.["azure-openai-responses"]?.models).toEqual([
        expect.objectContaining({
          id: "gpt-5.4",
          api: "azure-openai-responses",
          reasoning: true,
          input: ["text", "image"],
        }),
      ]);
      expect(next.agents?.defaults?.models?.["azure-openai-responses/gpt-5.4"]).toEqual({
        alias: "Azure OpenAI",
        params: {
          [AZURE_OPENAI_API_VERSION_PARAM]: "2025-04-01-preview",
        },
      });
    });

    it("omits model params for the default v1 api version", () => {
      const next = applyAzureOpenAIConfig(
        {},
        {
          baseUrl: "https://example.openai.azure.com",
          modelId: "gpt-5.4",
          apiVersion: "v1",
        },
      );

      expect(next.agents?.defaults?.models?.["azure-openai-responses/gpt-5.4"]).toEqual({
        alias: "Azure OpenAI",
      });
    });
  });
});
