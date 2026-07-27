import type { PostzProvider, ProviderSummary } from "./types.ts";

import x from "./x.ts";
import tiktok from "./tiktok.ts";
import youtube from "./youtube.ts";
import instagram from "./instagram.ts";
import instagramStandalone from "./instagram-standalone.ts";
import linkedin from "./linkedin.ts";
import linkedinPage from "./linkedin-page.ts";
import facebook from "./facebook.ts";
import threads from "./threads.ts";
import bluesky from "./bluesky.ts";
import mastodon from "./mastodon.ts";
import discord from "./discord.ts";
import telegram from "./telegram.ts";

export const POSTZ_PROVIDERS: PostzProvider[] = [
  x,
  tiktok,
  youtube,
  instagram,
  instagramStandalone,
  linkedin,
  linkedinPage,
  facebook,
  threads,
  bluesky,
  mastodon,
  discord,
  telegram,
];

const PROVIDERS_BY_ID = new Map<string, PostzProvider>(POSTZ_PROVIDERS.map((provider) => [provider.identifier, provider]));

export function getProvider(identifier: string): PostzProvider | null {
  return PROVIDERS_BY_ID.get(identifier) ?? null;
}

export function isProviderConfigured(provider: PostzProvider): boolean {
  if (!provider.requiredEnvVars || provider.requiredEnvVars.length === 0) return true;
  return provider.requiredEnvVars.every((name) => Boolean(Deno.env.get(name)));
}

export function listProviders(): ProviderSummary[] {
  return POSTZ_PROVIDERS.map((provider) => ({
    identifier: provider.identifier,
    name: provider.name,
    implemented: provider.implemented === true,
    configured: isProviderConfigured(provider),
    connectable: provider.implemented === true && isProviderConfigured(provider),
  }));
}
