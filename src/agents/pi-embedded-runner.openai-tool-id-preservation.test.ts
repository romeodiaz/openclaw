import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import {
  makeInMemorySessionManager,
  makeModelSnapshotEntry,
} from "./pi-embedded-runner.sanitize-session-history.test-harness.js";
import { sanitizeSessionHistory } from "./pi-embedded-runner/google.js";
import { castAgentMessage } from "./test-helpers/agent-message-fixtures.js";

describe("sanitizeSessionHistory openai tool id preservation", () => {
  const makeSessionManager = (params?: { provider?: string; modelApi?: string }) =>
    makeInMemorySessionManager([
      makeModelSnapshotEntry({
        provider: params?.provider ?? "openai",
        modelApi: params?.modelApi ?? "openai-responses",
        modelId: "gpt-5.2-codex",
      }),
    ]);

  const makeMessages = (withReasoning: boolean): AgentMessage[] => [
    castAgentMessage({
      role: "assistant",
      content: [
        ...(withReasoning
          ? [
              {
                type: "thinking",
                thinking: "internal reasoning",
                thinkingSignature: JSON.stringify({ id: "rs_123", type: "reasoning" }),
              },
            ]
          : []),
        { type: "toolCall", id: "call_123|fc_123", name: "noop", arguments: {} },
      ],
    }),
    castAgentMessage({
      role: "toolResult",
      toolCallId: "call_123|fc_123",
      toolName: "noop",
      content: [{ type: "text", text: "ok" }],
      isError: false,
    }),
  ];

  it.each([
    {
      provider: "openai",
      modelApi: "openai-responses",
      name: "strips fc ids when replayable reasoning metadata is missing",
      withReasoning: false,
      expectedToolId: "call_123",
    },
    {
      provider: "openai",
      modelApi: "openai-responses",
      name: "keeps canonical call_id|fc_id pairings when replayable reasoning is present",
      withReasoning: true,
      expectedToolId: "call_123|fc_123",
    },
    {
      provider: "azure-openai-responses",
      modelApi: "azure-openai-responses",
      name: "strips fc ids for azure-openai-responses when replayable reasoning metadata is missing",
      withReasoning: false,
      expectedToolId: "call_123",
    },
    {
      provider: "azure-openai-responses",
      modelApi: "azure-openai-responses",
      name: "keeps canonical call_id|fc_id pairings for azure-openai-responses when replayable reasoning is present",
      withReasoning: true,
      expectedToolId: "call_123|fc_123",
    },
  ])("$name", async ({ provider, modelApi, withReasoning, expectedToolId }) => {
    const result = await sanitizeSessionHistory({
      messages: makeMessages(withReasoning),
      modelApi,
      provider,
      modelId: "gpt-5.2-codex",
      sessionManager: makeSessionManager({ provider, modelApi }),
      sessionId: "test-session",
    });

    const assistant = result[0] as { content?: Array<{ type?: string; id?: string }> };
    const toolCall = assistant.content?.find((block) => block.type === "toolCall");
    expect(toolCall?.id).toBe(expectedToolId);

    const toolResult = result[1] as { toolCallId?: string };
    expect(toolResult.toolCallId).toBe(expectedToolId);
  });
});
