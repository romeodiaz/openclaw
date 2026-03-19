---
summary: "Use Azure-hosted OpenAI models in OpenClaw"
read_when:
  - You want to use Azure OpenAI or Azure AI Foundry with OpenClaw
  - You need first-class onboarding instead of a generic custom provider
title: "Azure OpenAI"
---

# Azure OpenAI

OpenClaw supports Azure-hosted OpenAI models through the dedicated
`azure-openai-responses` provider.

Use this when your organization runs OpenAI models behind Azure OpenAI or Azure
AI Foundry and you want a native onboarding path instead of a generic custom
endpoint.

## CLI setup

```bash
openclaw onboard --auth-choice azure-openai-api-key
```

Non-interactive:

```bash
openclaw onboard \
  --non-interactive \
  --accept-risk \
  --auth-choice azure-openai-api-key \
  --azure-openai-api-key "$AZURE_OPENAI_API_KEY" \
  --azure-openai-base-url "https://example.openai.azure.com" \
  --azure-openai-model-id "gpt-5.4"
```

Optional preview API version:

```bash
openclaw onboard \
  --non-interactive \
  --accept-risk \
  --auth-choice azure-openai-api-key \
  --azure-openai-api-key "$AZURE_OPENAI_API_KEY" \
  --azure-openai-base-url "https://example.openai.azure.com" \
  --azure-openai-model-id "gpt-5.4" \
  --azure-openai-api-version "2025-04-01-preview"
```

## Config snippet

```json5
{
  agents: {
    defaults: {
      model: { primary: "azure-openai-responses/gpt-5.4" },
      models: {
        "azure-openai-responses/gpt-5.4": {},
      },
    },
  },
  models: {
    providers: {
      "azure-openai-responses": {
        baseUrl: "https://example.openai.azure.com/openai/v1",
        api: "azure-openai-responses",
        models: [
          {
            id: "gpt-5.4",
            name: "gpt-5.4",
            reasoning: true,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 1050000,
            maxTokens: 128000,
          },
        ],
      },
    },
  },
}
```

## Notes

- The model ID should normally be your Azure deployment name.
- For now, deployment names that match the model family, such as `gpt-5.4`, work best for capability detection.
- OpenClaw normalizes Azure resource URLs to the native `/openai/v1` endpoint.
- Azure OpenAI uses the Azure Responses transport, not the generic
  `openai-completions` custom-provider path.
- If you need a non-default Azure API version, set it in model params:

```json5
{
  agents: {
    defaults: {
      models: {
        "azure-openai-responses/gpt-5.4": {
          params: {
            azureApiVersion: "2025-04-01-preview",
          },
        },
      },
    },
  },
}
```
