import type { StreamFn } from "@mariozechner/pi-agent-core";
import {
  type ProviderAuthContext,
  type ProviderAuthMethod,
  type ProviderAuthMethodNonInteractiveContext,
  type ProviderRuntimeModel,
} from "openclaw/plugin-sdk/core";
import {
  applyAuthProfileConfig,
  buildApiKeyCredential,
  ensureApiKeyFromOptionEnvOrPrompt,
  normalizeApiKeyInput,
  normalizeOptionalSecretInput,
  type SecretInput,
  upsertAuthProfile,
  validateApiKeyInput,
} from "openclaw/plugin-sdk/provider-auth";
import type { ModelProviderConfig, ProviderPlugin } from "openclaw/plugin-sdk/provider-models";
import {
  AZURE_OPENAI_API_VERSION_PARAM,
  AZURE_OPENAI_DEFAULT_API_VERSION,
  AZURE_OPENAI_PROFILE_ID,
  AZURE_OPENAI_PROVIDER_ID,
  AZURE_OPENAI_UNDERLYING_MODEL_ID_PARAM,
  applyAzureOpenAIConfig,
  buildAzureOpenAIModelDefinition,
  normalizeAzureOpenAIBaseUrl,
  normalizeAzureOpenAIModelId,
  resolveAzureOpenAICapabilityModelId,
} from "./azure-openai-onboard.js";

const PROVIDER_LABEL = "Azure OpenAI";
const PROVIDER_ENV_VAR = "AZURE_OPENAI_API_KEY";

type AzureOpenAISetupInput = {
  baseUrl: string;
  modelId: string;
  apiVersion?: string;
  underlyingModelId?: string;
};

function normalizeAzureOpenAIInput(params: AzureOpenAISetupInput): AzureOpenAISetupInput {
  const baseUrl = normalizeAzureOpenAIBaseUrl(params.baseUrl);
  const modelId = normalizeAzureOpenAIModelId(params.modelId);
  const apiVersion = normalizeOptionalSecretInput(params.apiVersion);
  const underlyingModelId = normalizeOptionalSecretInput(params.underlyingModelId);
  return {
    baseUrl,
    modelId,
    ...(apiVersion ? { apiVersion } : {}),
    ...(underlyingModelId ? { underlyingModelId } : {}),
  };
}

async function promptForAzureOpenAIInput(ctx: ProviderAuthContext): Promise<AzureOpenAISetupInput> {
  const existingProvider = ctx.config.models?.providers?.[AZURE_OPENAI_PROVIDER_ID];
  const existingBaseUrl =
    typeof existingProvider?.baseUrl === "string" ? existingProvider.baseUrl : undefined;
  const existingModelId =
    typeof existingProvider?.models?.[0]?.id === "string" ? existingProvider.models[0].id : "";
  const existingModelParams = ctx.config.agents?.defaults?.models?.[
    `${AZURE_OPENAI_PROVIDER_ID}/${existingModelId}`
  ]?.params as Record<string, unknown> | undefined;
  const existingApiVersion = normalizeOptionalSecretInput(
    existingModelParams?.[AZURE_OPENAI_API_VERSION_PARAM],
  );
  const existingUnderlyingModelId = normalizeOptionalSecretInput(
    existingModelParams?.[AZURE_OPENAI_UNDERLYING_MODEL_ID_PARAM],
  );

  const baseUrlInput = await ctx.prompter.text({
    message: "Azure OpenAI base URL",
    initialValue:
      normalizeOptionalSecretInput(ctx.opts?.azureOpenaiBaseUrl) ??
      existingBaseUrl ??
      process.env.AZURE_OPENAI_BASE_URL ??
      "",
    placeholder: "https://<resource>.openai.azure.com",
    validate: (value) => {
      try {
        normalizeAzureOpenAIBaseUrl(String(value ?? ""));
        return undefined;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
  });

  const modelIdInput = await ctx.prompter.text({
    message: "Azure deployment name",
    initialValue:
      normalizeOptionalSecretInput(ctx.opts?.azureOpenaiModelId) ?? existingModelId ?? "",
    placeholder: "gpt-5.4",
    validate: (value) => {
      try {
        normalizeAzureOpenAIModelId(String(value ?? ""));
        return undefined;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
  });

  const apiVersionInput = await ctx.prompter.text({
    message: "Azure API version (optional)",
    initialValue:
      normalizeOptionalSecretInput(ctx.opts?.azureOpenaiApiVersion) ??
      existingApiVersion ??
      process.env.AZURE_OPENAI_API_VERSION ??
      "",
    placeholder: AZURE_OPENAI_DEFAULT_API_VERSION,
    validate: () => undefined,
  });

  const underlyingModelIdInput = await ctx.prompter.text({
    message: "Azure underlying model ID (optional)",
    initialValue:
      normalizeOptionalSecretInput(ctx.opts?.azureOpenaiUnderlyingModelId) ??
      existingUnderlyingModelId ??
      resolveAzureOpenAICapabilityModelId({
        modelId:
          normalizeOptionalSecretInput(ctx.opts?.azureOpenaiModelId) ?? existingModelId ?? "",
      }) ??
      "",
    placeholder: "gpt-5.4",
    validate: (value) => {
      const normalized = normalizeOptionalSecretInput(String(value ?? ""));
      if (!normalized) {
        return undefined;
      }
      try {
        normalizeAzureOpenAIModelId(normalized);
        return undefined;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
  });

  return normalizeAzureOpenAIInput({
    baseUrl: String(baseUrlInput ?? ""),
    modelId: String(modelIdInput ?? ""),
    apiVersion: String(apiVersionInput ?? ""),
    underlyingModelId: String(underlyingModelIdInput ?? ""),
  });
}

function buildAzureOpenAIConfigPatch(params: AzureOpenAISetupInput) {
  return (cfg: Parameters<typeof applyAzureOpenAIConfig>[0]) => applyAzureOpenAIConfig(cfg, params);
}

async function runAzureOpenAIApiKeyAuth(ctx: ProviderAuthContext): Promise<{
  profiles: Array<{
    profileId: string;
    credential: ReturnType<typeof buildApiKeyCredential>;
  }>;
  configPatch: ReturnType<typeof applyAzureOpenAIConfig>;
  defaultModel: string;
}> {
  const input = await promptForAzureOpenAIInput(ctx);
  let capturedSecretInput: SecretInput | undefined;
  let capturedCredential = false;
  let capturedMode: "plaintext" | "ref" | undefined;

  await ensureApiKeyFromOptionEnvOrPrompt({
    token:
      normalizeOptionalSecretInput(ctx.opts?.azureOpenaiApiKey) ??
      normalizeOptionalSecretInput(ctx.opts?.token),
    tokenProvider: normalizeOptionalSecretInput(ctx.opts?.azureOpenaiApiKey)
      ? AZURE_OPENAI_PROVIDER_ID
      : normalizeOptionalSecretInput(ctx.opts?.tokenProvider),
    secretInputMode:
      ctx.allowSecretRefPrompt === false
        ? (ctx.secretInputMode ?? "plaintext")
        : ctx.secretInputMode,
    config: ctx.config,
    expectedProviders: [AZURE_OPENAI_PROVIDER_ID, "azure-openai"],
    provider: AZURE_OPENAI_PROVIDER_ID,
    envLabel: PROVIDER_ENV_VAR,
    promptMessage: "Enter Azure OpenAI API key",
    normalize: normalizeApiKeyInput,
    validate: validateApiKeyInput,
    prompter: ctx.prompter,
    setCredential: async (apiKey, mode) => {
      capturedSecretInput = apiKey;
      capturedCredential = true;
      capturedMode = mode;
    },
  });

  if (!capturedCredential) {
    throw new Error("Missing Azure OpenAI API key.");
  }

  const credentialInput = capturedSecretInput ?? "";
  const defaultModel = `${AZURE_OPENAI_PROVIDER_ID}/${input.modelId}`;

  return {
    profiles: [
      {
        profileId: AZURE_OPENAI_PROFILE_ID,
        credential: buildApiKeyCredential(
          AZURE_OPENAI_PROVIDER_ID,
          credentialInput,
          undefined,
          capturedMode ? { secretInputMode: capturedMode } : undefined,
        ),
      },
    ],
    configPatch: buildAzureOpenAIConfigPatch(input)(ctx.config),
    defaultModel,
  };
}

async function runAzureOpenAIApiKeyAuthNonInteractive(
  ctx: ProviderAuthMethodNonInteractiveContext,
) {
  const baseUrl = normalizeOptionalSecretInput(ctx.opts.azureOpenaiBaseUrl);
  const modelId = normalizeOptionalSecretInput(ctx.opts.azureOpenaiModelId);
  try {
    const input = normalizeAzureOpenAIInput({
      baseUrl: baseUrl ?? "",
      modelId: modelId ?? "",
      apiVersion: normalizeOptionalSecretInput(ctx.opts.azureOpenaiApiVersion),
      underlyingModelId: normalizeOptionalSecretInput(ctx.opts.azureOpenaiUnderlyingModelId),
    });

    const resolved = await ctx.resolveApiKey({
      provider: AZURE_OPENAI_PROVIDER_ID,
      flagValue: normalizeOptionalSecretInput(ctx.opts.azureOpenaiApiKey),
      flagName: "--azure-openai-api-key",
      envVar: PROVIDER_ENV_VAR,
    });
    if (!resolved) {
      return null;
    }

    if (resolved.source !== "profile") {
      const credential = ctx.toApiKeyCredential({
        provider: AZURE_OPENAI_PROVIDER_ID,
        resolved,
      });
      if (!credential) {
        return null;
      }
      upsertAuthProfile({
        profileId: AZURE_OPENAI_PROFILE_ID,
        credential,
        agentDir: ctx.agentDir,
      });
    }

    const next = applyAuthProfileConfig(ctx.config, {
      profileId: AZURE_OPENAI_PROFILE_ID,
      provider: AZURE_OPENAI_PROVIDER_ID,
      mode: "api_key",
    });
    return applyAzureOpenAIConfig(next, input);
  } catch (error) {
    ctx.runtime.error(error instanceof Error ? error.message : String(error));
    ctx.runtime.exit(1);
    return null;
  }
}

function buildAzureOpenAIApiKeyMethod(): ProviderAuthMethod {
  return {
    id: "api-key",
    label: "Azure OpenAI API key",
    hint: "Azure resource URL + deployment name",
    kind: "api_key",
    wizard: {
      choiceId: "azure-openai-api-key",
      choiceLabel: "Azure OpenAI API key",
      choiceHint: "Azure resource URL + deployment name",
      groupId: "openai",
      groupLabel: "OpenAI",
      groupHint: "Codex OAuth + API key + Azure",
    },
    run: async (ctx) => await runAzureOpenAIApiKeyAuth(ctx),
    runNonInteractive: async (ctx) => await runAzureOpenAIApiKeyAuthNonInteractive(ctx),
  };
}

function createAzureOpenAIStreamWrapper(
  baseStreamFn: StreamFn | undefined,
  extraParams: Record<string, unknown> | undefined,
  deploymentName: string,
): StreamFn | undefined {
  const underlying = baseStreamFn;
  if (!underlying) {
    return undefined;
  }
  const azureApiVersion = normalizeOptionalSecretInput(
    extraParams?.[AZURE_OPENAI_API_VERSION_PARAM],
  );
  return (model, context, options) =>
    underlying(model, context, {
      ...options,
      azureDeploymentName: deploymentName,
      ...(azureApiVersion ? { azureApiVersion } : {}),
    } as typeof options);
}

function normalizeAzureResolvedModel(params: {
  config:
    | ProviderAuthContext["config"]
    | ProviderAuthMethodNonInteractiveContext["config"]
    | undefined;
  deploymentName: string;
  model: ProviderRuntimeModel;
}) {
  const explicitUnderlyingModelId = normalizeOptionalSecretInput(
    params.config?.agents?.defaults?.models?.[
      `${AZURE_OPENAI_PROVIDER_ID}/${params.deploymentName}`
    ]?.params?.[AZURE_OPENAI_UNDERLYING_MODEL_ID_PARAM],
  );
  const capabilityModelId = resolveAzureOpenAICapabilityModelId({
    modelId: params.deploymentName,
    underlyingModelId: explicitUnderlyingModelId,
  });
  const normalizedRuntimeModel = buildAzureOpenAIModelDefinition({
    modelId: capabilityModelId ?? params.deploymentName,
  });
  const nextModel: ProviderRuntimeModel = {
    ...params.model,
    id: capabilityModelId ?? params.model.id,
    name: capabilityModelId ?? params.model.name,
    reasoning: normalizedRuntimeModel.reasoning,
    input: normalizedRuntimeModel.input,
    contextWindow: normalizedRuntimeModel.contextWindow,
    maxTokens: normalizedRuntimeModel.maxTokens,
  };

  if (
    nextModel.id === params.model.id &&
    nextModel.name === params.model.name &&
    nextModel.reasoning === params.model.reasoning &&
    JSON.stringify(nextModel.input) === JSON.stringify(params.model.input) &&
    nextModel.contextWindow === params.model.contextWindow &&
    nextModel.maxTokens === params.model.maxTokens
  ) {
    return undefined;
  }
  return nextModel;
}

function buildCatalogProvider(
  existingProvider: ModelProviderConfig,
  apiKey: string,
): ModelProviderConfig {
  return {
    ...existingProvider,
    baseUrl: existingProvider.baseUrl ?? "",
    api: "azure-openai-responses" as const,
    apiKey,
    models: Array.isArray(existingProvider.models)
      ? existingProvider.models
      : [buildAzureOpenAIModelDefinition({ modelId: "gpt-5.4" })],
    authHeader: existingProvider.authHeader ?? false,
  };
}

export function buildAzureOpenAIProviderPlugin(): ProviderPlugin {
  return {
    id: AZURE_OPENAI_PROVIDER_ID,
    label: PROVIDER_LABEL,
    docsPath: "/providers/azure-openai",
    aliases: ["azure-openai"],
    envVars: [PROVIDER_ENV_VAR, "AZURE_OPENAI_BASE_URL", "AZURE_OPENAI_API_VERSION"],
    auth: [buildAzureOpenAIApiKeyMethod()],
    catalog: {
      order: "simple" as const,
      run: async (ctx) => {
        const apiKey = ctx.resolveProviderApiKey(AZURE_OPENAI_PROVIDER_ID).apiKey;
        const provider = ctx.config.models?.providers?.[AZURE_OPENAI_PROVIDER_ID];
        if (!apiKey || !provider?.baseUrl) {
          return null;
        }
        return {
          provider: buildCatalogProvider(provider, apiKey),
        };
      },
    },
    normalizeResolvedModel: (ctx) =>
      normalizeAzureResolvedModel({
        config: ctx.config,
        deploymentName: ctx.modelId,
        model: ctx.model,
      }),
    capabilities: {
      providerFamily: "openai" as const,
    },
    wrapStreamFn: (ctx) =>
      createAzureOpenAIStreamWrapper(ctx.streamFn, ctx.extraParams, ctx.modelId),
  };
}
