import { supabase } from "@/integrations/supabase/client";

import {
  buildWzrdOsPlan,
  createWzrdOsRunPreview,
  type WzrdOsPlan,
  type WzrdOsPlanContext,
  type WzrdOsRunEvent,
  type WzrdOsRunPreview,
} from "./plan";

export interface WzrdOsRunHistoryItem {
  id: string;
  plan_id: string;
  status: string;
  mode: string;
  summary: string;
  created_at: string;
  completed_at: string | null;
  events?: WzrdOsRunEvent[];
}

type WzrdOsInvokeBody =
  | { action: "plan"; prompt: string; context?: WzrdOsPlanContext }
  | { action: "run-preview"; plan: WzrdOsPlan }
  | { action: "history"; limit?: number };

async function invokeWzrdOsAgent<T>(body: WzrdOsInvokeBody): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  const { data, error } = await supabase.functions.invoke("wzrdos-agent", {
    body,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("WZRDOS returned an empty response.");
  }

  return data as T;
}

function withFallbackWarning(plan: WzrdOsPlan, reason: unknown): WzrdOsPlan {
  const detail = reason instanceof Error ? reason.message : "WZRDOS agent unavailable.";
  return {
    ...plan,
    warnings: [...plan.warnings, `Local planner fallback: ${detail}`],
  };
}

export const wzrdOsService = {
  async planCommand(input: { prompt: string; context?: WzrdOsPlanContext }): Promise<WzrdOsPlan> {
    try {
      const res = await invokeWzrdOsAgent<{ plan: WzrdOsPlan }>({
        action: "plan",
        prompt: input.prompt,
        context: input.context,
      });
      return res.plan;
    } catch (error) {
      return withFallbackWarning(buildWzrdOsPlan(input.prompt, input.context), error);
    }
  },

  async runPreview(plan: WzrdOsPlan): Promise<WzrdOsRunPreview> {
    try {
      const res = await invokeWzrdOsAgent<{ run: WzrdOsRunPreview }>({
        action: "run-preview",
        plan,
      });
      return res.run;
    } catch {
      return createWzrdOsRunPreview(plan);
    }
  },

  async listRuns(limit = 8): Promise<WzrdOsRunHistoryItem[]> {
    try {
      const res = await invokeWzrdOsAgent<{ runs: WzrdOsRunHistoryItem[] }>({
        action: "history",
        limit,
      });
      return res.runs;
    } catch {
      return [];
    }
  },
};
