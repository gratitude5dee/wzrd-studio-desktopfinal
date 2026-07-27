import type { PostzProvider, ProviderCapabilities } from "./types.ts";

const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  text: { maxLength: 280, supportsThreads: false },
  media: {
    images: true,
    video: true,
    maxImages: 4,
    maxVideoSeconds: 120,
    maxFileBytes: 50 * 1024 * 1024,
  },
  firstComment: false,
};

export function notImplementedProvider(input: {
  identifier: string;
  name: string;
  requiredEnvVars?: string[];
  capabilities?: ProviderCapabilities;
}): PostzProvider {
  const capabilities = input.capabilities ?? DEFAULT_CAPABILITIES;

  return {
    identifier: input.identifier,
    name: input.name,
    implemented: false,
    capabilities,
    requiredEnvVars: input.requiredEnvVars,

    async generateAuthUrl() {
      throw new Error(`${input.name} provider not implemented yet`);
    },

    async authenticate() {
      throw new Error(`${input.name} provider not implemented yet`);
    },

    async refreshToken() {
      throw new Error(`${input.name} provider not implemented yet`);
    },

    async post() {
      throw new Error(`${input.name} provider not implemented yet`);
    },
  };
}
