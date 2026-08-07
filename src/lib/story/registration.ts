import type { LicenseTermsDataInput, StoryClient } from '@story-protocol/core-sdk';
import { parseEther, type Address } from 'viem';


import {
  getStoryExplorerIpUrl,
  ROYALTY_POLICY_LAP_ADDRESS,
  STORY_DEFAULT_SPG_NFT_CONTRACT,
} from '@/lib/story/constants';
import type { IPVaultItem, IPVaultLicenseProfile } from '@/types/ip-vault';

type StoryCoreSdkRuntime = {
  PILFlavor: any;
  WIP_TOKEN_ADDRESS: Address;
};

let storyCoreSdkRuntimePromise: Promise<StoryCoreSdkRuntime> | null = null;

async function loadStoryCoreSdkRuntime(): Promise<StoryCoreSdkRuntime> {
  if (!storyCoreSdkRuntimePromise) {
    storyCoreSdkRuntimePromise = import('@story-protocol/core-sdk').then((mod: any) => ({
      PILFlavor: mod.PILFlavor,
      WIP_TOKEN_ADDRESS: mod.WIP_TOKEN_ADDRESS as Address,
    }));
  }
  return storyCoreSdkRuntimePromise;
}

export interface StoryRegistrationOptions {
  spgNftContract?: string;
  walletAddress?: string | null;
}

export interface StoryRegistrationResult {
  ipId: string;
  tokenId?: string | null;
  nftContract?: string | null;
  txHash?: string | null;
  storyExplorerUrl: string;
  licenseTermsIds: string[];
  royaltyVaultAddress?: string | null;
}

export function assertStoryMetadataReady(item: IPVaultItem): void {
  const missing = [
    ['ipMetadataURI', item.ip_metadata_uri],
    ['ipMetadataHash', item.ip_metadata_hash],
    ['nftMetadataURI', item.nft_metadata_uri],
    ['nftMetadataHash', item.nft_metadata_hash],
  ].filter(([, value]) => !value);

  if (missing.length > 0) {
    throw new Error(`Story metadata is missing: ${missing.map(([name]) => name).join(', ')}`);
  }
}

function normalizeFee(value: number | null | undefined): bigint {
  if (!value || value <= 0) return 0n;
  return parseEther(String(value));
}

export async function buildLicenseTermsData(item: IPVaultItem): Promise<LicenseTermsDataInput[]> {
  const profile = item.license_profile as IPVaultLicenseProfile;
  if (profile === 'none') return [];

  if (profile === 'non_commercial_social_remix') {
    return [{ licenseTermsId: 1n }];
  }

  const { PILFlavor, WIP_TOKEN_ADDRESS } = await loadStoryCoreSdkRuntime();

  if (profile === 'commercial_use') {
    return [
      {
        terms: PILFlavor.commercialUse({
          defaultMintingFee: normalizeFee(item.minting_fee_wip),
          currency: WIP_TOKEN_ADDRESS,
          royaltyPolicy: (item.royalty_policy ?? ROYALTY_POLICY_LAP_ADDRESS) as any,
        }),
      },
    ];
  }

  if (profile === 'commercial_remix') {
    return [
      {
        terms: PILFlavor.commercialRemix({
          defaultMintingFee: normalizeFee(item.minting_fee_wip),
          commercialRevShare: item.commercial_rev_share ?? 5,
          currency: WIP_TOKEN_ADDRESS,
          royaltyPolicy: (item.royalty_policy ?? ROYALTY_POLICY_LAP_ADDRESS) as any,
        }),
      },
    ];
  }

  if (profile === 'creative_commons_attribution') {
    return [
      {
        terms: PILFlavor.creativeCommonsAttribution({
          currency: WIP_TOKEN_ADDRESS,
          royaltyPolicy: (item.royalty_policy ?? ROYALTY_POLICY_LAP_ADDRESS) as any,
        }),
      },
    ];
  }

  return [];
}

function extractLicenseTermsIds(response: unknown): string[] {
  const record = response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
  const ids = record.licenseTermsIds;
  if (Array.isArray(ids)) {
    return ids.map((id) => id?.toString()).filter((id): id is string => Boolean(id));
  }

  const ipAssets = record.ipAssetsWithLicenseTerms;
  if (Array.isArray(ipAssets)) {
    return ipAssets.flatMap((asset) => {
      const licenseTermsIds =
        asset && typeof asset === 'object'
          ? (asset as Record<string, unknown>).licenseTermsIds
          : null;
      return Array.isArray(licenseTermsIds)
        ? licenseTermsIds.map((id) => id?.toString()).filter((id): id is string => Boolean(id))
        : [];
    });
  }

  return [];
}

function getResponseString(response: unknown, key: string): string | null {
  const record = response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
  const value = record[key];
  return value === undefined || value === null ? null : value.toString();
}

function storyMetadataInput(item: IPVaultItem) {
  assertStoryMetadataReady(item);
  return {
    ipMetadataURI: item.ip_metadata_uri as string,
    ipMetadataHash: item.ip_metadata_hash as `0x${string}`,
    nftMetadataURI: item.nft_metadata_uri as string,
    nftMetadataHash: item.nft_metadata_hash as `0x${string}`,
  };
}

export function needsDerivativeRegistration(item: IPVaultItem): boolean {
  return item.relationship_type !== 'root' || item.parent_ip_ids.length > 0;
}

export async function registerVaultItemOnStory(
  client: StoryClient,
  item: IPVaultItem,
  options: StoryRegistrationOptions = {},
): Promise<StoryRegistrationResult> {
  assertStoryMetadataReady(item);
  const spgNftContract = (options.spgNftContract ?? STORY_DEFAULT_SPG_NFT_CONTRACT) as Address;
  const metadata = storyMetadataInput(item);
  const licenseTermsData = await buildLicenseTermsData(item);

  const derivative = needsDerivativeRegistration(item);
  if (derivative) {
    if (item.parent_ip_ids.length === 0 || item.license_terms_ids.length === 0) {
      throw new Error('Derivative registration requires parent IP IDs and parent license terms.');
    }

    const derivativeResponse = await client.ipAsset.registerDerivativeIpAsset({
      nft: {
        type: 'mint',
        spgNftContract,
        recipient: options.walletAddress as Address | undefined,
        allowDuplicates: false,
      },
      derivData: {
        parentIpIds: item.parent_ip_ids as Address[],
        licenseTermsIds: item.license_terms_ids.map((id) => BigInt(id)),
        maxMintingFee: 0n,
        maxRevenueShare: 100,
        maxRts: 100_000_000,
      },
      ipMetadata: metadata,
    });

    const ipId = getResponseString(derivativeResponse, 'ipId');
    if (!ipId) throw new Error('Story derivative registration did not return an IP ID.');

    return {
      ipId,
      tokenId: getResponseString(derivativeResponse, 'tokenId'),
      nftContract: spgNftContract,
      txHash: getResponseString(derivativeResponse, 'txHash'),
      storyExplorerUrl: getStoryExplorerIpUrl(ipId),
      licenseTermsIds: item.license_terms_ids,
      royaltyVaultAddress: getResponseString(derivativeResponse, 'ipRoyaltyVault'),
    };
  }

  const registrationResponse = await client.ipAsset.registerIpAsset({
    nft: {
      type: 'mint',
      spgNftContract,
      recipient: options.walletAddress as Address | undefined,
      allowDuplicates: false,
    },
    ipMetadata: metadata,
  });

  const ipId = getResponseString(registrationResponse, 'ipId');
  if (!ipId) throw new Error('Story registration did not return an IP ID.');

  let attachedLicenseTermsIds = item.license_terms_ids;
  if (licenseTermsData.length > 0) {
    const licenseResponse = await client.license.registerPilTermsAndAttach({
      ipId: ipId as Address,
      licenseTermsData,
    });
    attachedLicenseTermsIds = extractLicenseTermsIds(licenseResponse);
  }

  let royaltyVaultAddress: string | null = null;
  try {
    royaltyVaultAddress = await client.royalty.getRoyaltyVaultAddress(ipId as `0x${string}`);
  } catch {
    royaltyVaultAddress = null;
  }

  return {
    ipId,
    tokenId: getResponseString(registrationResponse, 'tokenId'),
    nftContract: spgNftContract,
    txHash: getResponseString(registrationResponse, 'txHash'),
    storyExplorerUrl: getStoryExplorerIpUrl(ipId),
    licenseTermsIds: attachedLicenseTermsIds,
    royaltyVaultAddress,
  };
}

export async function claimVaultRevenueOnStory(
  client: StoryClient,
  item: IPVaultItem,
  claimer: string,
): Promise<{ txHash?: string | null }> {
  if (!item.ip_id) throw new Error('Register the IP before claiming revenue.');
  const childIpIds = Array.isArray(item.proof_packet.childIpIds)
    ? item.proof_packet.childIpIds.filter((id): id is string => typeof id === 'string')
    : [];

  const { WIP_TOKEN_ADDRESS } = await loadStoryCoreSdkRuntime();


  const response = await client.royalty.claimAllRevenue({
    ancestorIpId: item.ip_id as Address,
    claimer: claimer as Address,
    childIpIds: childIpIds as Address[],
    royaltyPolicies: childIpIds.map(() => (item.royalty_policy ?? ROYALTY_POLICY_LAP_ADDRESS) as Address),
    currencyTokens: [WIP_TOKEN_ADDRESS],
    claimOptions: {
      autoTransferAllClaimedTokensFromIp: true,
      autoUnwrapIpTokens: true,
    },
  });

  return { txHash: getResponseString(response, 'txHash') };
}
