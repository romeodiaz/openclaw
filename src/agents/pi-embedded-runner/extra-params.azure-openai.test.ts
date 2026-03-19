import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { Context, Model } from "@mariozechner/pi-ai";
import { createAssistantMessageEventStream } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { applyExtraParamsToAgent } from "./extra-params.js";

type CapturedCall = {
  azureDeploymentName?: string;
  azureApiVersion?: string;
};

function applyAndCapture(params: {
  cfg?: OpenClawConfig;
  selectedModelId: string;
  runtimeModelId: string;
}): CapturedCall {
  const captured: CapturedCall = {};
  const baseStreamFn: StreamFn = (model, _context, options) => {
    captured.azureDeploymentName = (
      options as { azureDeploymentName?: string } | undefined
    )?.azureDeploymentName;
    captured.azureApiVersion = (
      options as { azureApiVersion?: string } | undefined
    )?.azureApiVersion;
    options?.onPayload?.({}, model);
    return createAssistantMessageEventStream();
  };
  const agent = { streamFn: baseStreamFn };

  applyExtraParamsToAgent(agent, params.cfg, "azure-openai-responses", params.selectedModelId);

  const model = {
    api: "azure-openai-responses",
    provider: "azure-openai-responses",
    id: params.runtimeModelId,
    baseUrl: "https://example.openai.azure.com/openai/v1",
  } as Model<"azure-openai-responses">;
  const context: Context = { messages: [] };

  void agent.streamFn?.(model, context, {});

  return captured;
}

describe("extra-params: Azure OpenAI", () => {
  it("passes the selected deployment name and API version to the Azure transport", () => {
    const cfg = {
      agents: {
        defaults: {
          models: {
            "azure-openai-responses/prod-chat": {
              params: {
                azureApiVersion: "2025-04-01-preview",
                azureUnderlyingModelId: "gpt-5.4",
              },
            },
          },
        },
      },
    } as OpenClawConfig;

    const captured = applyAndCapture({
      cfg,
      selectedModelId: "prod-chat",
      runtimeModelId: "gpt-5.4",
    });

    expect(captured).toEqual({
      azureDeploymentName: "prod-chat",
      azureApiVersion: "2025-04-01-preview",
    });
  });
});
