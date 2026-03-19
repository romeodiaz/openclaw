import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveManifestProviderOnboardAuthFlags = vi.hoisted(() =>
  vi.fn(() => [
    {
      optionKey: "azureOpenaiApiKey",
      authChoice: "azure-openai-api-key",
      cliFlag: "--azure-openai-api-key",
    },
    {
      optionKey: "openaiApiKey",
      authChoice: "openai-api-key",
      cliFlag: "--openai-api-key",
    },
  ]),
);

vi.mock("../../../plugins/provider-auth-choices.js", () => ({
  resolveManifestProviderOnboardAuthFlags,
}));

vi.mock("../../onboard-core-auth-flags.js", () => ({
  CORE_ONBOARD_AUTH_FLAGS: [],
}));

import { inferAuthChoiceFromFlags } from "./auth-choice-inference.js";

describe("inferAuthChoiceFromFlags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("infers Azure OpenAI from Azure-specific onboarding flags", () => {
    const result = inferAuthChoiceFromFlags({
      azureOpenaiBaseUrl: "https://example.openai.azure.com",
      azureOpenaiModelId: "gpt-5.4",
    } as never);

    expect(result.choice).toBe("azure-openai-api-key");
    expect(result.matches).toContainEqual({
      optionKey: "azureOpenaiBaseUrl",
      authChoice: "azure-openai-api-key",
      label: "--azure-openai-base-url/--azure-openai-model-id[/--azure-openai-api-version]",
    });
  });

  it("uses manifest metadata when the Azure API key flag is provided", () => {
    const result = inferAuthChoiceFromFlags({
      azureOpenaiApiKey: "sk-azure-test", // pragma: allowlist secret
    } as never);

    expect(result.choice).toBe("azure-openai-api-key");
    expect(result.matches[0]).toEqual({
      optionKey: "azureOpenaiApiKey",
      authChoice: "azure-openai-api-key",
      label: "--azure-openai-api-key",
    });
  });
});
