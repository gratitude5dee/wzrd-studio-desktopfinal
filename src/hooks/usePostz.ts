import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { postzQueryKeys, postzService } from "@/services/postzService";
import type { PostzGroup, PostzPost, PostzPostGroupCreateInput, PostzChannel, PostzPerChannelValidation } from "@/types/postz";

export const POSTZ_QUERY_KEYS = {
  all: ["postz"] as const,
  channels: () => postzQueryKeys.channels,
  postWindows: () => ["postz", "posts", "window"] as const,
  oauthProviders: () => postzQueryKeys.oauthProviders,
  integrations: () => postzQueryKeys.integrations,
  oauthTargets: (provider: string, stateId: string) => postzQueryKeys.oauthTargets(provider, stateId),
  window: (from: string, to: string, state: string | null) => postzQueryKeys.postsWindow(from, to, state),
  groups: () => ["postz", "posts", "group"] as const,
  group: (groupId: string) => postzQueryKeys.postGroup(groupId),
};

export function usePostzChannels(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: POSTZ_QUERY_KEYS.channels(),
    queryFn: () => postzService.listChannels(),
    staleTime: 10_000,
    enabled: options?.enabled ?? true,
  });
}

export function useSeedPostzChannels() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => postzService.seedChannels(),
    onSuccess: (channels: PostzChannel[]) => {
      queryClient.setQueryData(POSTZ_QUERY_KEYS.channels(), channels);
      toast.success("Demo channels created");
    },
    onError: (error: Error) => {
      toast.error("Unable to seed channels", { description: error.message });
    },
  });
}

export function usePostzOauthProviders(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: POSTZ_QUERY_KEYS.oauthProviders(),
    queryFn: () => postzService.listOauthProviders(),
    staleTime: 60_000,
    enabled: options?.enabled ?? true,
  });
}

export function usePostzIntegrationProviders(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: postzQueryKeys.integrations,
    queryFn: () => postzService.listIntegrationProviders(),
    staleTime: 10_000,
    enabled: options?.enabled ?? true,
  });
}

export function useStartPostzOauth() {
  return useMutation({
    mutationFn: (input: string | { provider: string; app_return_url?: string | null }) => {
      const payload = typeof input === "string" ? { provider: input } : input;
      return postzService.startOauth(payload);
    },
    onError: (error: Error) => {
      toast.error("Unable to start OAuth", { description: error.message });
    },
  });
}

export function useStartPostzIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { provider: string; app_return_url?: string | null }) => postzService.startComposioConnection(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: postzQueryKeys.integrations });
      queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.channels() });
    },
    onError: (error: Error) => {
      toast.error("Unable to start connection", { description: error.message });
    },
  });
}

export function useRevokePostzIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { channel_id?: string | null; connected_account_id?: string | null }) => postzService.revokeComposioConnection(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: postzQueryKeys.integrations });
      queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.channels() });
      toast.success("Connection revoked");
    },
    onError: (error: Error) => {
      toast.error("Unable to revoke connection", { description: error.message });
    },
  });
}

export function usePostzOauthTargets(input: { provider: string; state_id: string; enabled?: boolean }) {
  return useQuery({
    queryKey: POSTZ_QUERY_KEYS.oauthTargets(input.provider, input.state_id),
    queryFn: () => postzService.listOauthTargets({ provider: input.provider, state_id: input.state_id }),
    staleTime: 10_000,
    enabled: input.enabled ?? true,
  });
}

export function useFinalizePostzOauthTarget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { provider: string; state_id: string; target_id: string }) => postzService.finalizeOauthTarget(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.channels() });
      toast.success("Channel connected");
    },
    onError: (error: Error) => {
      toast.error("Unable to finish connection", { description: error.message });
    },
  });
}

export function usePostzPostsWindow(input: { from: string; to: string; state?: string | null }) {
  return useQuery({
    queryKey: POSTZ_QUERY_KEYS.window(input.from, input.to, input.state ?? null),
    queryFn: () => postzService.listPostsWindow({ from: input.from, to: input.to, state: input.state ?? null }),
    staleTime: 5_000,
  });
}

export function usePostzGroup(groupId: string | null) {
  return useQuery({
    queryKey: groupId ? POSTZ_QUERY_KEYS.group(groupId) : POSTZ_QUERY_KEYS.groups(),
    queryFn: () => {
      if (!groupId) throw new Error("groupId is required");
      return postzService.getGroup({ group_id: groupId });
    },
    enabled: Boolean(groupId),
  });
}

export function useCreatePostzGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (group: PostzPostGroupCreateInput) => postzService.createGroup({ group }),
    onSuccess: (group: PostzGroup) => {
      toast.success("Post saved");
      queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.postWindows() });
      queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.groups() });
      queryClient.setQueryData(POSTZ_QUERY_KEYS.group(group.group_id), group);
    },
    onError: (error: Error) => {
      toast.error("Unable to save post", { description: error.message });
    },
  });
}

export function useUpdatePostzGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { group_id: string; group: PostzPostGroupCreateInput }) => postzService.updateGroup(input),
    onSuccess: (group: PostzGroup) => {
      toast.success("Post updated");
      queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.postWindows() });
      queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.groups() });
      queryClient.setQueryData(POSTZ_QUERY_KEYS.group(group.group_id), group);
    },
    onError: (error: Error) => {
      toast.error("Unable to update post", { description: error.message });
    },
  });
}

export function useReschedulePostzGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { group_id: string; publish_date: string }) => postzService.updateGroupDate(input),
    onSuccess: () => {
      toast.success("Rescheduled");
      queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.postWindows() });
      queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.groups() });
    },
    onError: (error: Error) => {
      toast.error("Unable to reschedule", { description: error.message });
    },
  });
}

export function useDeletePostzGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (groupId: string) => postzService.deleteGroup({ group_id: groupId }),
    onSuccess: () => {
      toast.success("Deleted");
      queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.postWindows() });
      queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.groups() });
    },
    onError: (error: Error) => {
      toast.error("Unable to delete", { description: error.message });
    },
  });
}

export function useValidatePostzGroup() {
  return useMutation({
    mutationFn: (group: PostzPostGroupCreateInput) => postzService.validateGroup({ group }),
  });
}

export function useFindPostzSlot() {
  return useMutation({
    mutationFn: (channelId: string | null) => postzService.findSlot({ channel_id: channelId }),
    onError: (error: Error) => {
      toast.error("Unable to find recommended slot", { description: error.message });
    },
  });
}

export function usePostNowPostzGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (groupId: string) => postzService.postNow({ group_id: groupId }),
    onSuccess: () => {
      toast.success("Publishing started");
      queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.postWindows() });
      queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.groups() });
    },
    onError: (error: Error) => {
      toast.error("Unable to publish now", { description: error.message });
    },
  });
}
