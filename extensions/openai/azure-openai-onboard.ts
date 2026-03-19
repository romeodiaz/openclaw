import type { OpenClawConfig } from "openclaw/plugin-sdk/provider-auth";
import type { ModelDefinitionConfig } from "openclaw/plugin-sdk/provider-models";
import {
  applyAgentDefaultModelPrimary,
  applyProviderConfigWithDefaultModel,
} from "openclaw/plugin-sdk/provider-onboard";

export const AZURE_OPENAI_PROVIDER_ID = "azure-openai-responses";
export const AZURE_OPENAI_PROFILE_ID = `${AZURE_OPENAI_PROVIDER_ID}:default`;
export const AZURE_OPENAI_API_VERSION_PARAM = "azureApiVersion";
export const AZURE_OPENAI_UNDERLYING_MODEL_ID_PARAM = "azureUnderlyingModelId";
export const AZURE_OPENAI_DEFAULT_API_VERSION = "v1";

const AZURE_OPENAI_ALLOWED_HOST_SUFFIXES = [
  ".openai.azure.com",
  ".services.ai.azure.com",
  ".cognitiveservices.azure.com",
] as const;

const DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

type AzureOpenAIConfigParams = {
  baseUrl: string;
  modelId: string;
  apiVersion?: string;
  underlyingModelId?: string;
};

type AgentModelParams = Record<string, unknown>;

function isAzureOpenAIHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return AZURE_OPENAI_ALLOWED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function normalizeAzureApiVersion(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === AZURE_OPENAI_DEFAULT_API_VERSION) {
    return undefined;
  }
  return trimmed;
}

function normalizeOptionalAzureOpenAIModelId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? normalizeAzureOpenAIModelId(trimmed) : undefined;
}

function normalizeAzurePath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "");
  if (
    normalized === "" ||
    normalized === "/" ||
    normalized === "/openai" ||
    normalized === "/openai/v1" ||
    normalized.startsWith("/openai/deployments/")
  ) {
    return "/openai/v1";
  }
  throw new Error(
    [
      "Azure OpenAI base URL must point at the Azure resource endpoint.",
      "Use a resource URL such as https://<resource>.openai.azure.com or https://<resource>.openai.azure.com/openai/v1.",
    ].join(" "),
  );
}

export function normalizeAzureOpenAIBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("Azure OpenAI base URL must be a valid URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Azure OpenAI base URL must use https.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Azure OpenAI base URL must not include embedded credentials.");
  }
  if (!isAzureOpenAIHost(parsed.hostname)) {
    throw new Error("Azure OpenAI base URL must use an Azure OpenAI or Azure AI Foundry hostname.");
  }

  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = normalizeAzurePath(parsed.pathname);
  return parsed.toString().replace(/\/+$/, "");
}

export function normalizeAzureOpenAIModelId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Azure OpenAI model ID is required.");
  }
  return trimmed;
}

function isReasoningModel(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  return (
    normalized.startsWith("gpt-5") ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4")
  );
}

function isVisionCapableModel(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  return (
    normalized.startsWith("gpt-4") || normalized.startsWith("gpt-5") || normalized === "o4-mini"
  );
}

function looksLikeAzureCapabilityModelId(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  return (
    normalized.startsWith("gpt-") ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4")
  );
}

export function resolveAzureOpenAICapabilityModelId(params: {
  modelId: string;
  underlyingModelId?: string;
}): string | undefined {
  const explicit = normalizeOptionalAzureOpenAIModelId(params.underlyingModelId);
  if (explicit) {
    return explicit;
  }
  const deploymentName = normalizeOptionalAzureOpenAIModelId(params.modelId);
  if (!deploymentName) {
    return undefined;
  }
  return looksLikeAzureCapabilityModelId(deploymentName) ? deploymentName : undefined;
}

function resolveAzureOpenAIModelCapabilities(params: {
  modelId: string;
  underlyingModelId?: string;
}) {
  const capabilityModelId = resolveAzureOpenAICapabilityModelId(params);
  if (!capabilityModelId) {
    return {
      capabilityModelId: undefined,
      reasoning: true,
      input: ["text", "image"] as Array<"text" | "image">,
      contextWindow: 1_050_000,
      maxTokens: 128_000,
    };
  }

  const reasoning = isReasoningModel(capabilityModelId);
  const input = isVisionCapableModel(capabilityModelId)
    ? (["text", "image"] as Array<"text" | "image">)
    : (["text"] as Array<"text" | "image">);

  return {
    capabilityModelId,
    reasoning,
    input,
    contextWindow: reasoning ? 1_050_000 : 200_000,
    maxTokens: reasoning ? 128_000 : 16_384,
  };
}

export function buildAzureOpenAIModelDefinition(params: {
  modelId: string;
  underlyingModelId?: string;
}): ModelDefinitionConfig {
  const normalizedModelId = normalizeAzureOpenAIModelId(params.modelId);
  const capabilities = resolveAzureOpenAIModelCapabilities(params);

  return {
    id: normalizedModelId,
    name: normalizedModelId,
    api: "azure-openai-responses",
    reasoning: capabilities.reasoning,
    input: capabilities.input,
    cost: DEFAULT_COST,
    contextWindow: capabilities.contextWindow,
    maxTokens: capabilities.maxTokens,
  };
}

function mergeAzureAgentModelParams(
  existing: AgentModelParams | undefined,
  apiVersion: string | undefined,
  underlyingModelId: string | undefined,
  deploymentName: string,
): AgentModelParams | undefined {
  const next = { ...(existing ?? {}) };
  const normalizedApiVersion = normalizeAzureApiVersion(apiVersion);
  const normalizedUnderlyingModelId = normalizeOptionalAzureOpenAIModelId(underlyingModelId);
  if (normalizedApiVersion) {
    next[AZURE_OPENAI_API_VERSION_PARAM] = normalizedApiVersion;
  } else {
    delete next[AZURE_OPENAI_API_VERSION_PARAM];
  }
  if (
    normalizedUnderlyingModelId &&
    normalizedUnderlyingModelId !== normalizeAzureOpenAIModelId(deploymentName)
  ) {
    next[AZURE_OPENAI_UNDERLYING_MODEL_ID_PARAM] = normalizedUnderlyingModelId;
  } else {
    delete next[AZURE_OPENAI_UNDERLYING_MODEL_ID_PARAM];
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function applyAzureOpenAIProviderConfig(
  cfg: OpenClawConfig,
  params: AzureOpenAIConfigParams,
): OpenClawConfig {
  const baseUrl = normalizeAzureOpenAIBaseUrl(params.baseUrl);
  const modelId = normalizeAzureOpenAIModelId(params.modelId);
  const modelRef = `${AZURE_OPENAI_PROVIDER_ID}/${modelId}`;
  const defaultModel = buildAzureOpenAIModelDefinition({
    modelId,
    underlyingModelId: params.underlyingModelId,
  });
  const agentModels = { ...cfg.agents?.defaults?.models };
  const existingAgentModel = agentModels[modelRef];
  const mergedParams = mergeAzureAgentModelParams(
    existingAgentModel?.params,
    params.apiVersion,
    params.underlyingModelId,
    modelId,
  );

  agentModels[modelRef] = {
    ...existingAgentModel,
    alias: existingAgentModel?.alias ?? "Azure OpenAI",
    ...(mergedParams ? { params: mergedParams } : {}),
  };

  const next = applyProviderConfigWithDefaultModel(cfg, {
    agentModels,
    providerId: AZURE_OPENAI_PROVIDER_ID,
    api: "azure-openai-responses",
    baseUrl,
    defaultModel,
  });

  if (mergedParams) {
    return {
      ...next,
      agents: {
        ...next.agents,
        defaults: {
          ...next.agents?.defaults,
          models: {
            ...next.agents?.defaults?.models,
            [modelRef]: {
              ...next.agents?.defaults?.models?.[modelRef],
              params: mergedParams,
            },
          },
        },
      },
    };
  }

  const existingNextModel = next.agents?.defaults?.models?.[modelRef];
  if (!existingNextModel?.params) {
    return next;
  }
  const { params: _params, ...rest } = existingNextModel;
  return {
    ...next,
    agents: {
      ...next.agents,
      defaults: {
        ...next.agents?.defaults,
        models: {
          ...next.agents?.defaults?.models,
          [modelRef]: rest,
        },
      },
    },
  };
}

export function applyAzureOpenAIConfig(
  cfg: OpenClawConfig,
  params: AzureOpenAIConfigParams,
): OpenClawConfig {
  const modelId = normalizeAzureOpenAIModelId(params.modelId);
  const modelRef = `${AZURE_OPENAI_PROVIDER_ID}/${modelId}`;
  return applyAgentDefaultModelPrimary(applyAzureOpenAIProviderConfig(cfg, params), modelRef);
}
