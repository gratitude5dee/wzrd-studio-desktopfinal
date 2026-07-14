import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fal } from "https://esm.sh/@fal-ai/client@1.2.3";
import { 
  topoSort,
  collectInputs,
  extractOutputValue,
  normalizeInputValues,
  substituteVariables,
  hasFailedDependency,
  createSSEEvent,
  getSSEHeaders,
  ComputeNode,
  ComputeEdge
} from "../_shared/compute-utils.ts";
import { getCatalogModelById } from "../_shared/ai-model-catalog.ts";
import type { CatalogMediaType } from "../_shared/ai-model-catalog.ts";
import {
  buildExecutionSelection,
  buildFalCatalogPayload,
  createNotImplementedArtifact,
  expandBatchInputs,
  isNotImplementedResult,
  normalizeFalCatalogOutput,
  type BatchPolicy,
} from "../_shared/compute-action-helpers.ts";
import {
  mergeFalModelInputs,
  resolveFalModelOrFallback,
} from "../_shared/falai-client.ts";
import {
  getMediaActionById,
  type MediaActionDefinition,
} from "../_shared/mediaActionRegistry.ts";
import {
  executeGmiChatCompletion,
  executeGmiQueueModel,
  pollGmiQueueStatus,
} from "../_shared/gmi-client.ts";
import { extractGmiMedia } from "../_shared/gmi-types.ts";
import { enhancePromptForImageGeneration } from "../_shared/image-edit.ts";
import {
  buildCreditIdempotencyKey,
  commitCredits,
  getCreditCostForModel,
  InsufficientCreditsError,
  insufficientCreditsResponse,
  releaseCredits,
  reserveCredits,
  shouldSkipCreditBilling,
} from "../_shared/credits.ts";
import {
  getNodeExecutionWarning,
  getNodePreflightError,
  isExecutionExcludedKind,
  normalizeNodeKind,
  normalizeNodeStatus,
  normalizeRunStatus,
} from "../_shared/computeContract.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-credit-billing',
};

// --- Cinematic shot compilation (mirrors src/lib/studio/shotCamera.ts) ---
type ShotControl = {
  shotSize?: string;
  cameraBody?: string;
  lensFamily?: string;
  focalLength?: string;
  aperture?: string;
  movement?: string;
  mood?: string;
};
const SHOT_SIZE_LABELS: Record<string, string> = {
  wide: 'wide', medium: 'medium', 'close-up': 'close-up',
  ecu: 'extreme close-up', ots: 'over-the-shoulder', pov: 'POV',
};
function compileCinematicPrompt(rawPrompt: string, shot: ShotControl | undefined, mediaType: 'image' | 'video'): string {
  const trimmed = (rawPrompt ?? '').trim();
  if (!shot || (!shot.shotSize && !shot.cameraBody && !shot.lensFamily && !shot.focalLength && !shot.aperture && !shot.movement && !shot.mood)) return trimmed;
  const f: string[] = [];
  if (shot.cameraBody) f.push(`shot on ${shot.cameraBody}`);
  if (shot.lensFamily) f.push(shot.lensFamily);
  if (shot.focalLength && shot.aperture) f.push(`${shot.focalLength} at ${shot.aperture}`);
  else if (shot.focalLength) f.push(shot.focalLength);
  else if (shot.aperture) f.push(shot.aperture);
  if (shot.shotSize && SHOT_SIZE_LABELS[shot.shotSize]) f.push(`${SHOT_SIZE_LABELS[shot.shotSize]} framing`);
  if (mediaType === 'video' && shot.movement) f.push(`${shot.movement.toLowerCase()} camera movement`);
  if (shot.mood) f.push(`${shot.mood.toLowerCase()} mood`);
  if (!f.length) return trimmed;
  const suffix = f.join(', ');
  if (!trimmed) return suffix.charAt(0).toUpperCase() + suffix.slice(1) + '.';
  const sep = /[.!?]$/.test(trimmed) ? ' ' : '. ';
  return `${trimmed}${sep}${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}.`;
}
function normalizeReferenceInputs(inputs: Record<string, any> | null | undefined): string[] {
  if (!inputs) return [];
  const out: string[] = [];
  const push = (v: any): void => {
    if (!v) return;
    if (typeof v === 'string' && v.trim()) { out.push(v.trim()); return; }
    if (Array.isArray(v)) { for (const x of v) push(x); return; }
    if (typeof v === 'object' && typeof v.url === 'string') push(v.url);
  };
  for (const k of ['reference','references','referenceImage','referenceImages','reference_image','reference_images','referenceImageUrls','reference_image_urls','image','images','image_url','image_urls']) {
    if (k in inputs) push(inputs[k]);
  }
  return Array.from(new Set(out));
}
function shotToCameraPayload(shot: ShotControl | undefined) {
  if (!shot) return undefined;
  const has = shot.shotSize || shot.cameraBody || shot.lensFamily || shot.focalLength || shot.aperture || shot.movement || shot.mood;
  if (!has) return undefined;
  return { body: shot.cameraBody, lens: shot.lensFamily, focal_length: shot.focalLength, aperture: shot.aperture, shot_size: shot.shotSize, movement: shot.movement, mood: shot.mood };
}


interface ExecuteRequest {
  projectId: string;
  nodeIds?: string[];
  excludedNodeIds?: string[];
  useCache?: boolean;
  requestId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create supabase client with user token
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Authenticate user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('[ComputeExecute] Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { projectId, nodeIds, excludedNodeIds = [], useCache = true, requestId }: ExecuteRequest = await req.json();
    console.log('[ComputeExecute] Starting execution for project:', projectId);

    if (!projectId) {
      return new Response(JSON.stringify({ error: 'projectId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: nodes, error: nodesError } = await supabaseClient
      .from('compute_nodes')
      .select('*')
      .eq('project_id', projectId);

    const { data: edges, error: edgesError } = await supabaseClient
      .from('compute_edges')
      .select('*')
      .eq('project_id', projectId);

    if (nodesError || edgesError) {
      console.error('[ComputeExecute] Error fetching graph:', nodesError || edgesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch compute graph' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!nodes || nodes.length === 0) {
      return new Response(JSON.stringify({ error: 'No nodes to execute' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const canonicalNodes = (nodes as Record<string, any>[]).map(normalizeComputeNodeRow);
    const canonicalNodeMap = new Map(canonicalNodes.map((node) => [node.id, node]));
    const validatedExcludedNodeIds = excludedNodeIds.filter((nodeId) => {
      const node = canonicalNodeMap.get(nodeId);
      if (!node) return false;
      const action = getNodeActionDefinition(node);
      return action?.executor === 'ffmpeg' &&
        action.providerPreference.includes('local') &&
        !action.providerPreference.some((provider) => provider === 'fal-ai' || provider === 'edge_function');
    });
    const canonicalEdges = (edges ?? []) as ComputeEdge[];
    const allExecutableNodes = canonicalNodes.filter((node) => !isExecutionExcludedKind(node.kind));
    const allExecutableNodeIds = new Set(allExecutableNodes.map((node) => node.id));
    const allExecutableEdges = canonicalEdges.filter(
      (edge) => allExecutableNodeIds.has(edge.source_node_id) && allExecutableNodeIds.has(edge.target_node_id)
    );

    const selectedExecutionIds =
      nodeIds?.length
        ? buildExecutionSelection(
            nodeIds.filter((nodeId) => allExecutableNodeIds.has(nodeId)),
            allExecutableEdges,
            validatedExcludedNodeIds,
          )
        : null;

    const executableNodes = selectedExecutionIds
      ? allExecutableNodes.filter((node) => selectedExecutionIds.has(node.id))
      : allExecutableNodes;
    const executableNodeIds = new Set(executableNodes.map((node) => node.id));
    const executableEdges = allExecutableEdges.filter(
      (edge) => executableNodeIds.has(edge.source_node_id) && executableNodeIds.has(edge.target_node_id)
    );

    if (executableNodes.length === 0) {
      return new Response(JSON.stringify({ error: 'No executable nodes in graph' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    for (const node of executableNodes) {
      const preflightError = getNodePreflightError(node);
      if (!preflightError) {
        continue;
      }

      await supabaseClient
        .from('compute_nodes')
        .update({ status: 'failed', error: preflightError })
        .eq('id', node.id);

      return new Response(JSON.stringify({ error: preflightError, nodeId: node.id }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const billableCostsByNode = new Map<string, number>();
    let estimatedCredits = 0;
    for (const node of executableNodes) {
      const cost = resolveNodeCreditCost(node);
      if (cost > 0) {
        billableCostsByNode.set(node.id, cost);
        estimatedCredits += cost;
      }
    }

    const reservation =
      estimatedCredits > 0
        ? await reserveCredits({
            supabase: supabaseClient,
            userId: user.id,
            resourceType: 'generation',
            requestedAmount: estimatedCredits,
            referenceType: 'compute_execute',
            referenceId: projectId,
            idempotencyKey: buildCreditIdempotencyKey(
              'compute-execute',
              user.id,
              projectId,
              requestId || crypto.randomUUID()
            ),
            metadata: {
              endpoint: 'compute-execute',
              project_id: projectId,
              estimated_credits: estimatedCredits,
            },
            skipBilling: shouldSkipCreditBilling(req.headers),
          })
        : { holdId: null, requestedAmount: 0, availableAfter: 0, skipped: true };

    // Create service role client for updates
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Create execution run
    const { data: run, error: runError } = await serviceClient
      .from('compute_runs')
      .insert({
        project_id: projectId,
        user_id: user.id,
        status: 'running',
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (runError) {
      console.error('[ComputeExecute] Error creating run:', runError);
      return new Response(JSON.stringify({ error: 'Failed to create execution run' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const runId = run.id;
    console.log('[ComputeExecute] Created run:', runId);

    // Return SSE stream for real-time updates
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: Record<string, unknown>) => {
          try {
            controller.enqueue(createSSEEvent(event, data));
          } catch (e) {
            console.error('[ComputeExecute] SSE send error:', e);
          }
        };
        let actualCredits = 0;

        try {
          // Send initial metadata
          send('meta', { 
            run_id: runId, 
            project_id: projectId, 
            total_nodes: executableNodes.length 
          });

          // Perform topological sort
          const sortedLevels = topoSort(executableNodes as ComputeNode[], executableEdges);
          const executionOrder = sortedLevels.flat().map(n => n.id);

          // Update run with execution order
          await serviceClient
            .from('compute_runs')
            .update({ execution_order: executionOrder })
            .eq('id', runId);

          // Track outputs and failed nodes
          const outputs = new Map<string, any>();
          const failedNodes = new Set<string>();
          let completedCount = 0;

          // Process each level
          for (const level of sortedLevels) {
            console.log('[ComputeExecute] Processing level with nodes:', level.map(n => n.id));

            // Process nodes in parallel within each level
            await Promise.all(level.map(async (node) => {
              // Check for failed dependencies
              if (hasFailedDependency(node.id, executableEdges, failedNodes)) {
                failedNodes.add(node.id);
                
                await updateNodeStatus(serviceClient, node.id, 'skipped', {
                  error: 'Upstream dependency failed'
                });
                
                await createRunEvent(serviceClient, runId, node.id, 'skipped', {
                  message: 'Skipped due to upstream failure'
                });

                send('node_status', { 
                  node_id: node.id, 
                  status: 'skipped', 
                  error: 'Upstream dependency failed' 
                });
                return;
              }

              // Update node status to running
              await updateNodeStatus(serviceClient, node.id, 'running', { progress: 0 });
              await createRunEvent(serviceClient, runId, node.id, 'running', {
                message: `Executing ${node.label}`
              });

              send('node_status', { node_id: node.id, status: 'running' });

              try {
                const startTime = Date.now();

                // Collect inputs from upstream nodes
                const edgeInputs = collectInputs(node, executableEdges, outputs, canonicalNodeMap);
                
                // Also include manual inputs from node params
                const manualInputs = node.params?.inputs ?? {};
                const combinedInputs = { ...manualInputs };
                
                // Merge edge inputs using semantic handle names while preserving raw artifacts.
                for (const [key, value] of Object.entries(edgeInputs)) {
                  const bindings = Array.isArray(value) ? value : [value];
                  const rawArtifacts = bindings.map((binding) => binding.raw);
                  const normalizedValues = bindings.map((binding) => binding.value);
                  combinedInputs[key] = normalizedValues.length === 1 ? normalizedValues[0] : normalizedValues;
                  combinedInputs[`${key}_asset`] = rawArtifacts.length === 1 ? rawArtifacts[0] : rawArtifacts;
                  combinedInputs[`${key}_source_handles`] = bindings.map((binding) => binding.sourceHandle);
                }

                const normalizedInputs = await normalizeInputValues(combinedInputs);

                console.log(`[ComputeExecute] Node ${node.id} (${node.kind}) inputs:`, 
                  JSON.stringify(normalizedInputs).substring(0, 200));

                // Execute by registry action first, then legacy kind fallback.
                let result: any;
                const actionResult = await executeActionNode(node, normalizedInputs, send);

                if (actionResult.handled) {
                  result = actionResult.result;
                } else {
                  switch (node.kind) {
                  case 'Text':
                  case 'Prompt':
                    result = await executeTextNode(node, normalizedInputs, send);
                    break;

                  case 'Image':
                    result = await executeImageNode(node, normalizedInputs, send);
                    break;

                  case 'Video':
                    result = await executeVideoNode(node, normalizedInputs, send);
                    break;

                  case 'Audio':
                    result = await executeAudioNode(node, normalizedInputs, send);
                    break;

                  case 'Upload':
                    result = { 
                      type: 'file', 
                      url: node.params?.url ?? node.params?.value ?? null,
                      data: node.params
                    };
                    break;

                  case 'ImageEdit':
                    result = executeImageEditNode(node);
                    break;

                  case 'Transform': {
                    const inputData = Object.values(normalizedInputs)[0] || {};
                    result = { 
                      type: 'json', 
                      data: { ...inputData, transformed: true } 
                    };
                    break;
                  }

                  case 'Combine': {
                    // Combine multiple inputs
                    const allValues = Object.values(normalizedInputs);
                    const textValues = allValues.filter(v => typeof v === 'string');
                    const arrayValues = allValues.filter(v => Array.isArray(v)).flat();
                    
                    if (textValues.length > 0) {
                      result = { type: 'text', data: textValues.join('\n\n') };
                    } else if (arrayValues.length > 0) {
                      result = { type: 'array', data: arrayValues };
                    } else {
                      result = { type: 'json', data: normalizedInputs };
                    }
                    break;
                  }

                  case 'Output':
                    result = { 
                      type: 'json', 
                      data: normalizedInputs,
                      artifacts: Object.values(normalizedInputs)
                    };
                    break;

                  case 'Model':
                  case 'Gateway':
                    result = {
                      type: 'json',
                      data: normalizedInputs,
                      config: node.params ?? {},
                      warnings: [getNodeExecutionWarning(node.kind)].filter(Boolean),
                    };
                    break;

                  default:
                    throw new Error(`Unsupported canonical node kind: ${node.kind}`);
                  }
                }

                const processingTime = Date.now() - startTime;
                outputs.set(node.id, result);
                completedCount++;
                if (!isNotImplementedResult(result)) {
                  actualCredits += billableCostsByNode.get(node.id) ?? 0;
                }

                // Update node status
                await updateNodeStatus(serviceClient, node.id, 'succeeded', {
                  progress: 100,
                  preview: result
                });

                // Create run event
                await createRunEvent(serviceClient, runId, node.id, 'succeeded', {
                  progress: 100,
                  artifacts: result
                });

                // Send completion event
                send('node_status', { 
                  node_id: node.id, 
                  status: 'succeeded',
                  output: result,
                  processing_time_ms: processingTime
                });

                console.log(`[ComputeExecute] Node ${node.id} completed in ${processingTime}ms`);

              } catch (nodeError: any) {
                console.error(`[ComputeExecute] Node ${node.id} failed:`, nodeError);
                failedNodes.add(node.id);

                await updateNodeStatus(serviceClient, node.id, 'failed', {
                  error: nodeError.message
                });

                await createRunEvent(serviceClient, runId, node.id, 'failed', {
                  message: nodeError.message
                });

                send('node_status', { 
                  node_id: node.id, 
                  status: 'failed',
                  error: nodeError.message
                });
              }
            }));
          }

          // Finalize run
          const finalStatus =
            failedNodes.size === 0
              ? 'succeeded'
              : completedCount > 0
                ? 'partial'
                : 'failed';
          
          await serviceClient
            .from('compute_runs')
            .update({
              status: normalizeRunStatus(finalStatus),
              finished_at: new Date().toISOString()
            })
            .eq('id', runId);

          // Collect all outputs
          const allOutputs: Record<string, any> = {};
          outputs.forEach((value, nodeId) => {
            allOutputs[nodeId] = value;
          });

          send('complete', { 
            run_id: runId,
            status: normalizeRunStatus(finalStatus),
            outputs: allOutputs,
            completed_nodes: completedCount,
            total_nodes: executableNodes.length,
            failed_nodes: Array.from(failedNodes)
          });

          if (!reservation.skipped && reservation.holdId) {
            if (actualCredits > 0) {
              await commitCredits({
                supabase: supabaseClient,
                holdId: reservation.holdId,
                skipped: reservation.skipped,
                amount: actualCredits,
                metadata: {
                  endpoint: 'compute-execute',
                  project_id: projectId,
                  run_id: runId,
                  failed_nodes: Array.from(failedNodes),
                },
              });
            } else {
              await releaseCredits({
                supabase: supabaseClient,
                holdId: reservation.holdId,
                skipped: reservation.skipped,
                reason: 'no_billable_nodes_succeeded',
                metadata: {
                  endpoint: 'compute-execute',
                  project_id: projectId,
                  run_id: runId,
                },
              });
            }
          }

          console.log(`[ComputeExecute] Run ${runId} completed. ${completedCount}/${executableNodes.length} nodes succeeded.`);

        } catch (error: any) {
          console.error('[ComputeExecute] Execution error:', error);

          await serviceClient
            .from('compute_runs')
            .update({
              status: 'failed',
              finished_at: new Date().toISOString(),
              error: error.message
            })
            .eq('id', runId);

          send('error', { 
            run_id: runId,
            error: error.message 
          });

          if (!reservation.skipped && reservation.holdId) {
            if (actualCredits > 0) {
              await commitCredits({
                supabase: supabaseClient,
                holdId: reservation.holdId,
                skipped: reservation.skipped,
                amount: actualCredits,
                metadata: {
                  endpoint: 'compute-execute',
                  project_id: projectId,
                  run_id: runId,
                  partial: true,
                  error: error.message,
                },
              });
            } else {
              await releaseCredits({
                supabase: supabaseClient,
                holdId: reservation.holdId,
                skipped: reservation.skipped,
                reason: 'execution_error',
                metadata: {
                  endpoint: 'compute-execute',
                  project_id: projectId,
                  run_id: runId,
                  error: error.message,
                },
              });
            }
          }
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: getSSEHeaders(corsHeaders)
    });

  } catch (error: any) {
    if (error instanceof InsufficientCreditsError) {
      return insufficientCreditsResponse(error, corsHeaders);
    }
    console.error('[ComputeExecute] Fatal error:', error);
    // Return generic error to client, log details server-side only
    return new Response(JSON.stringify({ error: 'An error occurred during compute execution' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// ============= Helper Functions =============

async function updateNodeStatus(
  supabase: any, 
  nodeId: string, 
  status: string, 
  updates: Record<string, any> = {}
) {
  await supabase
    .from('compute_nodes')
    .update({ status: normalizeNodeStatus(status), ...updates })
    .eq('id', nodeId);
}

function resolveNodeCreditCost(node: ComputeNode): number {
  const kind = normalizeNodeKind(node.kind);
  const action = getNodeActionDefinition(node);
  const actionId = getNodeActionId(node);
  const model = typeof node.params?.model === 'string' ? node.params.model : undefined;

  if (
    action?.costEstimate === 0 ||
    action?.executor === 'passthrough' ||
    action?.executor === 'embed' ||
    action?.executor === 'ffmpeg' ||
    action?.executor === 'output' ||
    actionId?.startsWith('embed.') ||
    actionId?.startsWith('fal.ffmpeg') ||
    model?.includes('/v1/')
  ) {
    return 0;
  }

  if (action?.requiresRealExecutor && action.modelMediaType) {
    return getCreditCostForModel(model, action.modelMediaType === '3d' || action.modelMediaType === 'json' ? 'image' : action.modelMediaType);
  }

  if (
    kind === 'Transform' ||
    kind === 'Combine' ||
    kind === 'Upload' ||
    kind === 'Output' ||
    kind === 'Model' ||
    kind === 'Gateway' ||
    kind === 'comment'
  ) {
    return 0;
  }

  if (kind === 'Video') {
    return getCreditCostForModel(model, 'video');
  }
  if (kind === 'Audio') {
    return getCreditCostForModel(model, 'audio');
  }
  if (kind === 'Text' || kind === 'Prompt') {
    return getCreditCostForModel(model, 'text');
  }
  return getCreditCostForModel(model, 'image');
}

async function createRunEvent(
  supabase: any,
  runId: string,
  nodeId: string,
  status: string,
  data: Record<string, any> = {}
) {
  await supabase
    .from('compute_run_events')
    .insert({
      run_id: runId,
      node_id: nodeId,
      status: normalizeNodeStatus(status),
      ...data
    });
}

function normalizeComputeNodeRow(node: Record<string, any>): ComputeNode {
  return {
    id: node.id,
    label: node.label ?? 'Untitled',
    params: node.params ?? {},
    kind: normalizeNodeKind(node.kind) ?? 'Transform',
    status: normalizeNodeStatus(node.status),
    inputs: Array.isArray(node.inputs) ? node.inputs : [],
    outputs: Array.isArray(node.outputs) ? node.outputs : [],
    preview: node.preview ?? null,
    data: {
      ...(node.data && typeof node.data === 'object' ? node.data : {}),
      metadata: node.metadata ?? {},
    },
    position:
      node.position && typeof node.position === 'object'
        ? { x: Number(node.position.x ?? 0), y: Number(node.position.y ?? 0) }
        : undefined,
  };
}

type ActionExecutor =
  | 'text'
  | 'text_utility'
  | 'image'
  | 'video'
  | 'audio'
  | 'model_3d'
  | 'upload'
  | 'image_edit'
  | 'transform'
  | 'combine'
  | 'batch'
  | 'embed'
  | 'output';

const ACTION_EXECUTOR_REGISTRY: Record<string, ActionExecutor> = {
  'text.enter': 'text_utility',
  'text.upload': 'upload',
  'text.split': 'text_utility',
  'text.concat': 'text_utility',
  'text.find-replace': 'text_utility',
  'text.summarize': 'text',
  'text.analyze': 'text',
  'text.task-breakdown': 'text',
  'text.prompt-generation': 'text',
  'text.scene-storyboarding': 'text',
  'image.upload': 'upload',
  'image.generate': 'image',
  'image.edit': 'image',
  'image.image-to-image': 'image',
  'image.style-transfer': 'image',
  'image.analysis': 'embed',
  'image.object-detection': 'embed',
  'image.color-key': 'transform',
  'image.color-grade': 'transform',
  'image.color-filter': 'transform',
  'image.color-tint': 'transform',
  'image.blur': 'transform',
  'image.rotate': 'transform',
  'image.flip': 'transform',
  'image.duplicate': 'transform',
  'image.depth-map': 'transform',
  'image.sketch': 'transform',
  'image.change-aspect-ratio': 'transform',
  'image.stereo': 'transform',
  'image.panorama': 'transform',
  'image.to-world': 'transform',
  'video.upload': 'upload',
  'video.generate': 'video',
  'video.image-to-video': 'video',
  'video.video-to-video': 'video',
  'video.edit': 'video',
  'video.lipsync': 'video',
  'video.analysis': 'embed',
  'video.reasoning': 'embed',
  'video.object-detection': 'embed',
  'video.track-anything': 'embed',
  'video.extract-frames': 'transform',
  'video.frame-grid': 'transform',
  'video.stitch': 'combine',
  'video.split': 'transform',
  'video.reverse': 'transform',
  'video.boomerang': 'transform',
  'video.speed': 'transform',
  'video.slow': 'transform',
  'video.watermark': 'transform',
  'video.long-exposure': 'transform',
  'video.color-grade': 'transform',
  'video.color-filter': 'transform',
  'video.effect': 'transform',
  'audio.upload': 'upload',
  'audio.analysis': 'embed',
  'audio.tts': 'audio',
  'audio.music': 'audio',
  'audio.sfx': 'audio',
  'audio.separate': 'transform',
  'audio.to-prompt': 'text',
  'audio.manipulate': 'transform',
  'fal.ffmpeg': 'transform',
  'asset.upload-3d': 'upload',
  'asset.image-to-3d': 'model_3d',
  'asset.text-to-3d': 'model_3d',
  'asset.preview-convert': 'transform',
  'embed.url': 'embed',
  'embed.editframe': 'embed',
  'embed.remotion': 'embed',
  'embed.hyperframes': 'embed',
  'embed.browser-agent': 'embed',
  'batch.cartesian': 'batch',
  'output.materialize': 'output',
};

function getNodeActionId(node: ComputeNode): string | null {
  const fromParams = node.params?.actionId;
  const fromMetadata = node.params?.metadata?.actionId ?? node.data?.metadata?.actionId;
  const value = typeof fromParams === 'string' ? fromParams : fromMetadata;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function inferActionExecutor(actionId: string): ActionExecutor | null {
  if (ACTION_EXECUTOR_REGISTRY[actionId]) {
    return ACTION_EXECUTOR_REGISTRY[actionId];
  }
  if (actionId.startsWith('text.')) return 'text';
  if (actionId.startsWith('image.')) return 'image';
  if (actionId.startsWith('video.')) return 'video';
  if (actionId.startsWith('audio.')) return 'audio';
  if (actionId.startsWith('asset.')) return 'model_3d';
  if (actionId.startsWith('fal.')) return 'transform';
  if (actionId.startsWith('embed.')) return 'embed';
  if (actionId.startsWith('batch.')) return 'batch';
  return null;
}

function firstInputValue(inputs: Record<string, any>): any {
  const direct = inputs.input ?? inputs.media ?? inputs.text ?? inputs.image ?? inputs.video ?? inputs.audio ?? inputs.asset;
  if (direct !== undefined) return direct;
  return Object.values(inputs).find((value) => value !== undefined && value !== null);
}

function materializeUploadAction(node: ComputeNode, inputs: Record<string, any>, actionId: string): Record<string, any> {
  const type = actionId.startsWith('image.')
    ? 'image'
    : actionId.startsWith('video.')
      ? 'video'
      : actionId.startsWith('audio.')
        ? 'audio'
        : actionId.startsWith('asset.')
          ? '3d'
          : 'text';
  const url = node.params?.url ?? node.params?.assetUrl ?? node.params?.fileUrl ?? inputs.url ?? inputs.file_url ?? null;
  const data = type === 'text'
    ? node.params?.text ?? node.params?.value ?? inputs.text ?? inputs.input ?? ''
    : node.params;
  return { type, url, data, action_id: actionId };
}

function executeTextUtilityAction(node: ComputeNode, inputs: Record<string, any>, actionId: string): Record<string, any> {
  const inputText = String(inputs.text ?? inputs.input ?? node.params?.text ?? node.params?.prompt ?? '');
  if (actionId === 'text.split') {
    const delimiter = String(node.params?.delimiter ?? '\n');
    return {
      type: 'json',
      data: inputText.split(delimiter).map((value) => value.trim()).filter(Boolean),
      action_id: actionId,
    };
  }
  if (actionId === 'text.concat') {
    const values = Object.values(inputs)
      .flat()
      .filter((value) => typeof value === 'string' && value.trim().length > 0);
    return { type: 'text', data: values.join(String(node.params?.separator ?? '\n')), action_id: actionId };
  }
  if (actionId === 'text.find-replace') {
    const find = String(node.params?.find ?? '');
    const replace = String(node.params?.replace ?? '');
    return {
      type: 'text',
      data: find ? inputText.split(find).join(replace) : inputText,
      action_id: actionId,
    };
  }
  return { type: 'text', data: inputText, action_id: actionId };
}

function getNodeActionDefinition(node: ComputeNode): MediaActionDefinition | undefined {
  return getMediaActionById(getNodeActionId(node) ?? undefined);
}

function getNodeBatchPolicy(node: ComputeNode, action?: MediaActionDefinition): BatchPolicy {
  const explicit = node.params?.batchPolicy ?? node.params?.batch_policy ?? node.params?.batch?.policy;
  const value = typeof explicit === 'string' ? explicit : action?.batchPolicy;
  return value === 'map' || value === 'zip' || value === 'cartesian' || value === 'fanOut'
    ? value
    : 'single';
}

function executeBatchAction(inputs: Record<string, any>, actionId: string, policy: BatchPolicy): Record<string, any> {
  const items = expandBatchInputs(inputs, policy);
  return {
    type: 'json',
    data: {
      policy,
      item_count: items.length,
      items,
    },
    action_id: actionId,
  };
}

function inferNodeMediaType(node: ComputeNode, action?: MediaActionDefinition): CatalogMediaType {
  const fromAction = action?.modelMediaType ?? action?.mediaType;
  if (fromAction === 'text' || fromAction === 'image' || fromAction === 'video' || fromAction === 'audio' || fromAction === 'json' || fromAction === '3d') {
    return fromAction;
  }
  const kind = normalizeNodeKind(node.kind);
  if (kind === 'Video') return 'video';
  if (kind === 'Audio') return 'audio';
  if (kind === 'Text' || kind === 'Prompt') return 'text';
  if (kind === 'Model') return '3d';
  return 'image';
}

function defaultFalModelForMedia(mediaType: CatalogMediaType): string {
  if (mediaType === 'video') return 'fal-ai/kling-video/o3/standard/text-to-video';
  if (mediaType === 'audio') return 'fal-ai/elevenlabs/tts/turbo-v2.5';
  if (mediaType === '3d') return 'fal-ai/trellis/multi';
  return 'fal-ai/nano-banana-2';
}

function extractBatchItemsFromInputs(inputs: Record<string, any>): Record<string, any>[] | null {
  const candidates = [
    inputs.items,
    inputs.input,
    inputs.batch,
    inputs.items_asset,
    ...Object.values(inputs),
  ];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }
    const record = candidate as Record<string, any>;
    const items = Array.isArray(record.items)
      ? record.items
      : record.data && typeof record.data === 'object' && Array.isArray(record.data.items)
        ? record.data.items
        : null;
    if (items?.length) {
      return items.map((item) => item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, any> : { input: item });
    }
  }
  return null;
}

async function executeFalCatalogNode(
  node: ComputeNode,
  inputs: Record<string, any>,
  send: (event: string, data: Record<string, unknown>) => void,
  mediaType: CatalogMediaType,
  options: { prompt?: string; referenceUrls?: string[]; camera?: Record<string, unknown> } = {}
): Promise<any> {
  const action = getNodeActionDefinition(node);
  const rawModel = String(node.params?.model ?? action?.defaultModelId ?? defaultFalModelForMedia(mediaType));
  const runtimeModel = await getCatalogModelById(rawModel);
  const actionId = getNodeActionId(node) ?? action?.actionId ?? node.kind;

  if (!runtimeModel) {
    return createNotImplementedArtifact({
      actionId,
      mediaType,
      reason: `Catalog model not found: ${rawModel}`,
      inputs,
      params: node.params,
    });
  }

  if (runtimeModel.provider !== 'fal-ai' || runtimeModel.transportType !== 'fal_queue') {
    return createNotImplementedArtifact({
      actionId,
      mediaType,
      reason: `Unsupported catalog transport: ${runtimeModel.provider}/${runtimeModel.transportType}`,
      inputs,
      params: node.params,
    });
  }

  if (runtimeModel.mediaType !== mediaType) {
    return createNotImplementedArtifact({
      actionId,
      mediaType,
      reason: `Model media type ${runtimeModel.mediaType} is not compatible with ${mediaType}`,
      inputs,
      params: node.params,
    });
  }

  const FAL_KEY = Deno.env.get('FAL_KEY');
  if (!FAL_KEY) {
    throw new Error('FAL_KEY is not configured for Fal catalog execution');
  }

  fal.config({ credentials: FAL_KEY });

  const batchPolicy = getNodeBatchPolicy(node, action);
  const batchItems = extractBatchItemsFromInputs(inputs);
  const itemInputs = batchItems ?? (batchPolicy === 'single' ? [inputs] : expandBatchInputs(inputs, batchPolicy));
  const outputs: Record<string, unknown>[] = [];

  send('node_progress', {
    node_id: node.id,
    progress: 10,
    message: `Queuing ${runtimeModel.name}...`,
  });

  for (let index = 0; index < itemInputs.length; index += 1) {
    const itemInput = itemInputs[index];
    const payload = buildFalCatalogPayload({
      model: runtimeModel,
      params: node.params,
      inputs: itemInput,
      mediaType,
      prompt: options.prompt,
      referenceUrls: options.referenceUrls ?? normalizeReferenceInputs(itemInput),
      camera: options.camera,
    });

    const result = await fal.subscribe(runtimeModel.endpointId, {
      input: payload,
      logs: true,
      onQueueUpdate: (update: any) => {
        if (update.status === 'IN_PROGRESS') {
          const baseProgress = itemInputs.length > 1 ? 10 + (index / itemInputs.length) * 75 : 10;
          const logCount = update.logs?.length ?? 0;
          send('node_progress', {
            node_id: node.id,
            progress: Math.min(90, baseProgress + logCount * 5),
            message: `Generating ${mediaType}...`,
            logs: update.logs?.slice(-3),
          });
        }
      },
    });

    outputs.push(normalizeFalCatalogOutput({
      result,
      mediaType,
      requestedModel: rawModel,
      endpointModel: runtimeModel.endpointId,
      prompt: options.prompt,
    }));
  }

  if (outputs.length === 1) {
    return outputs[0];
  }

  const variants = outputs.flatMap((output, index) => {
    const outputVariants = Array.isArray(output.variants) ? output.variants : [];
    return outputVariants.length > 0
      ? outputVariants
      : [{ id: `${runtimeModel.endpointId}:${index}`, type: mediaType, url: output.url, data: output.data }];
  });

  return {
    type: mediaType,
    url: typeof outputs[0].url === 'string' ? outputs[0].url : undefined,
    data: {
      policy: batchPolicy,
      item_count: outputs.length,
      items: outputs,
    },
    variants,
    model: rawModel,
    endpoint_model: runtimeModel.endpointId,
  };
}

async function executeActionNode(
  node: ComputeNode,
  inputs: Record<string, any>,
  send: (event: string, data: Record<string, unknown>) => void
): Promise<{ handled: boolean; result?: any }> {
  const actionId = getNodeActionId(node);
  if (!actionId) {
    return { handled: false };
  }

  const executor = inferActionExecutor(actionId);
  if (!executor) {
    return { handled: false };
  }

  switch (executor) {
    case 'text':
      return { handled: true, result: await executeTextNode(node, inputs, send) };
    case 'text_utility':
      return { handled: true, result: executeTextUtilityAction(node, inputs, actionId) };
    case 'image':
      return { handled: true, result: await executeImageNode(node, inputs, send) };
    case 'video':
      return { handled: true, result: await executeVideoNode(node, inputs, send) };
    case 'audio':
      return { handled: true, result: await executeAudioNode(node, inputs, send) };
    case 'model_3d':
      return { handled: true, result: await executeFalCatalogNode(node, inputs, send, '3d') };
    case 'upload':
      return { handled: true, result: materializeUploadAction(node, inputs, actionId) };
    case 'image_edit':
      return { handled: true, result: executeImageEditNode(node) };
    case 'combine':
      return { handled: true, result: { type: 'json', data: { inputs, action_id: actionId } } };
    case 'batch':
      return { handled: true, result: executeBatchAction(inputs, actionId, getNodeBatchPolicy(node, getNodeActionDefinition(node))) };
    case 'embed':
      return {
        handled: true,
        result: createNotImplementedArtifact({
          actionId,
          mediaType: getNodeActionDefinition(node)?.outputPreviewType ?? 'json',
          reason: 'This embed/render action is registered but its server-side renderer is not implemented in this pass.',
          inputs,
          params: node.params,
        }),
      };
    case 'output':
      return { handled: true, result: firstInputValue(inputs) ?? { type: 'json', data: inputs, action_id: actionId } };
    case 'transform':
    default:
      return {
        handled: true,
        result: createNotImplementedArtifact({
          actionId,
          mediaType: getNodeActionDefinition(node)?.outputPreviewType ?? inferNodeMediaType(node, getNodeActionDefinition(node)),
          reason: 'This utility action is registered but its deterministic executor is not implemented in this pass.',
          inputs,
          params: node.params,
        }),
      };
  }
}

function getEdgeFunctionName(model: Record<string, any> | null): string | null {
  const rawPayload = model?.rawPayload && typeof model.rawPayload === 'object'
    ? (model.rawPayload as Record<string, unknown>)
    : {};
  const configured = typeof rawPayload.edge_function === 'string' ? rawPayload.edge_function : null;
  if (configured) {
    return configured;
  }
  return typeof model?.endpointId === 'string'
    ? model.endpointId.split(':')[0]
    : null;
}

async function invokeLocalEdgeFunction(functionName: string, body: Record<string, unknown>): Promise<Response> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL environment variable is not set');
  }

  return await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function arrayBufferToDataUrl(contentType: string, buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

function executeImageEditNode(node: ComputeNode) {
  const previewAssetUrl = typeof node.params?.previewAssetUrl === 'string' ? node.params.previewAssetUrl : '';
  const outputAssetUrl = typeof node.params?.outputAssetUrl === 'string' ? node.params.outputAssetUrl : '';
  const assetUrl = outputAssetUrl || previewAssetUrl;

  if (!assetUrl) {
    throw new Error('ImageEdit node has no materialized output asset.');
  }

  return {
    type: 'image',
    url: assetUrl,
    data: {
      url: assetUrl,
      layers: Array.isArray(node.params?.layers) ? node.params.layers : [],
      previewAssetUrl: previewAssetUrl || undefined,
      outputAssetUrl: outputAssetUrl || undefined,
    },
  };
}

async function pollGmiUntilComplete(
  requestId: string,
  mediaType: 'image' | 'video' | 'audio',
  nodeId: string,
  send: (event: string, data: Record<string, unknown>) => void
) {
  const maxPolls = 120;
  const pollIntervalMs = 3000;

  for (let pollCount = 0; pollCount < maxPolls; pollCount += 1) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const pollResult = await pollGmiQueueStatus(requestId);
    if (!pollResult.success) {
      throw new Error(pollResult.error ?? 'Failed to poll GMI request');
    }

    const status = pollResult.data?.status ?? 'queued';
    send('node_progress', {
      node_id: nodeId,
      progress: Math.min(95, 20 + pollCount * 2),
      message: `Processing with GMI Cloud (${status})`,
    });

    if (status === 'success') {
      return pollResult.data;
    }

    if (status === 'failed' || status === 'cancelled') {
      throw new Error(`GMI ${mediaType} generation ${status}`);
    }
  }

  throw new Error('GMI request timed out');
}

// ============= Node Execution Functions =============

async function executeTextNode(
  node: ComputeNode,
  inputs: Record<string, any>,
  send: (event: string, data: Record<string, unknown>) => void
): Promise<any> {
  const prompt = node.params?.prompt ?? inputs.prompt ?? '';
  const systemPrompt = node.params?.systemPrompt ?? 'You are a helpful assistant.';
  const model = node.params?.model ?? 'llama-3.3-70b-versatile';
  const maxTokens = node.params?.maxTokens ?? 1024;
  const temperature = node.params?.temperature ?? 0.7;

  // Substitute input variables in prompt
  const finalPrompt = substituteVariables(prompt, inputs);
  const runtimeModel = await getCatalogModelById(model);

  if (runtimeModel?.provider === 'gmi-cloud') {
    send('node_progress', {
      node_id: node.id,
      progress: 10,
      message: 'Calling GMI Cloud chat completion...',
    });

    const contentParts: Array<Record<string, unknown>> = [{ type: 'text', text: finalPrompt }];
    const imageUrl = typeof inputs.image === 'string' ? inputs.image : inputs.image_url;
    const videoUrl = typeof inputs.video === 'string' ? inputs.video : inputs.video_url;
    const audioUrl = typeof inputs.audio === 'string' ? inputs.audio : inputs.audio_url;
    if (typeof imageUrl === 'string' && imageUrl.length > 0) {
      contentParts.push({ type: 'image_url', image_url: { url: imageUrl } });
    }
    if (typeof videoUrl === 'string' && videoUrl.length > 0) {
      contentParts.push({ type: 'video_url', video_url: { url: videoUrl } });
    }
    if (typeof audioUrl === 'string' && audioUrl.length > 0) {
      contentParts.push({ type: 'audio_url', audio_url: { url: audioUrl } });
    }

    const gmiResult = await executeGmiChatCompletion(
      runtimeModel.endpointId,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contentParts },
      ],
      {
        max_tokens: maxTokens,
        temperature,
        stream: false,
      }
    );

    if (!gmiResult.success || !gmiResult.data) {
      throw new Error(gmiResult.error ?? 'GMI text generation failed');
    }

    const content = gmiResult.data.choices?.[0]?.message?.content ?? '';
    return {
      type: 'text',
      data: content,
      model,
      endpoint_model: runtimeModel.endpointId,
      tokens: gmiResult.data.usage,
    };
  }

  if (runtimeModel?.transportType === 'edge_function') {
    const functionName = getEdgeFunctionName(runtimeModel);
    if (!functionName) {
      throw new Error(`Model ${model} is missing an edge function mapping`);
    }

    const response = await invokeLocalEdgeFunction(functionName, {
      prompt: finalPrompt,
      model: (runtimeModel.rawPayload as Record<string, unknown>)?.model ?? model,
      systemPrompt,
      stream: false,
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    return {
      type: 'text',
      data: data.choices?.[0]?.message?.content ?? '',
      model,
      endpoint_model: functionName,
      tokens: data.usage,
    };
  }

  if (runtimeModel?.provider === 'fal-ai') {
    return await executeFalCatalogNode(node, inputs, send, runtimeModel.mediaType, {
      prompt: finalPrompt,
    });
  }

  const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured for legacy text execution');
  }

  console.log(`[TextNode] Running Groq ${model} with prompt: ${finalPrompt.substring(0, 100)}...`);

  send('node_progress', { 
    node_id: node.id, 
    progress: 10,
    message: 'Calling Groq API...'
  });

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: finalPrompt }
      ],
      max_tokens: maxTokens,
      temperature
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[TextNode] Groq API error: ${response.status}`, errorText);
    throw new Error(`Groq API error: ${response.status} - ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? '';

  console.log(`[TextNode] Generated ${content.length} chars`);

  return { 
    type: 'text', 
    data: content,
    model,
    tokens: data.usage
  };
}

async function executeImageNode(
  node: ComputeNode,
  inputs: Record<string, any>,
  send: (event: string, data: Record<string, unknown>) => void
): Promise<any> {
  const rawModel = String(node.params?.model ?? 'fal-ai/nano-banana-2');
  let prompt = node.params?.prompt ?? inputs.prompt ?? '';
  const negativePrompt = node.params?.negativePrompt ?? '';
  const shot = (node.params?.shot ?? undefined) as ShotControl | undefined;

  // Substitute input variables
  prompt = substituteVariables(prompt, inputs);

  // Apply cinematic shot suffix (non-destructive — raw prompt is preserved on the node)
  prompt = compileCinematicPrompt(prompt, shot, 'image');

  // Check if prompt is empty
  if (!prompt || prompt.trim().length === 0) {
    console.error('[ImageNode] Empty prompt provided');
    throw new Error('Image generation requires a prompt. Please add a visual description.');
  }

  // Normalize reference images coming from upstream nodes (reference / image / image_url / image_urls)
  const referenceUrls = normalizeReferenceInputs(inputs);

  // Detect and enhance non-visual prompts (task descriptions)
  const enhancedPrompt = enhancePromptForImageGeneration(prompt);
  const runtimeModel = await getCatalogModelById(rawModel);
  const cameraPayload = shotToCameraPayload(shot);

  if (runtimeModel?.provider === 'gmi-cloud') {
    send('node_progress', {
      node_id: node.id,
      progress: 10,
      message: 'Submitting image generation to GMI Cloud...',
    });

    const payload: Record<string, unknown> = {
      prompt: enhancedPrompt,
      ...node.params?.settings,
      ...inputs,
      aspect_ratio: node.params?.aspectRatio ?? inputs.aspect_ratio,
      resolution: node.params?.resolution ?? inputs.resolution,
      output_format: node.params?.outputFormat ?? inputs.output_format,
      image_url: referenceUrls[0] ?? (typeof inputs.image === 'string' ? inputs.image : inputs.image_url),
      image_urls: referenceUrls.length > 0 ? referenceUrls : (Array.isArray(inputs.image) ? inputs.image : inputs.image_urls),
      negative_prompt: negativePrompt || undefined,
      element_ids: node.params?.elementIds ?? inputs.element_ids,
      camera: shotToCameraPayload(shot),
    };

    const submitResult = await executeGmiQueueModel(runtimeModel.endpointId, payload, runtimeModel.payloadKeys);
    if (!submitResult.success || !submitResult.requestId) {
      throw new Error(submitResult.error ?? 'GMI image submission failed');
    }

    const finalResult = await pollGmiUntilComplete(submitResult.requestId, 'image', node.id, send);
    const media = extractGmiMedia(finalResult, 'image');
    if (!media.primaryUrl) {
      throw new Error('GMI image generation did not return an image URL');
    }

    return {
      type: 'image',
      url: media.primaryUrl,
      urls: media.outputs.map((entry) => entry.url),
      model: rawModel,
      endpoint_model: runtimeModel.endpointId,
      prompt: enhancedPrompt,
      element_id: media.elementId,
    };
  }

  if (runtimeModel?.provider === 'fal-ai') {
    return await executeFalCatalogNode(node, inputs, send, 'image', {
      prompt: enhancedPrompt,
      referenceUrls,
      camera: cameraPayload,
    });
  }

  if (runtimeModel && runtimeModel.transportType !== 'fal_queue' && runtimeModel.provider !== 'fal-ai') {
    throw new Error(`Unsupported image model transport: ${runtimeModel.transportType}`);
  }

  const FAL_KEY = Deno.env.get('FAL_KEY');
  
  if (!FAL_KEY) {
    throw new Error('FAL_KEY is not configured for legacy image execution');
  }

  fal.config({ credentials: FAL_KEY });

  const resolvedModel = resolveFalModelOrFallback(rawModel, {
    mediaTypeHint: 'image',
    uiGroup: 'generation',
  });
  
  if (enhancedPrompt !== prompt) {
    console.log(`[ImageNode] Enhanced non-visual prompt: "${prompt.substring(0, 50)}..." -> "${enhancedPrompt.substring(0, 80)}..."`);
  }

  const baseFalInputs: Record<string, any> = {
    prompt: enhancedPrompt,
    image_size: node.params?.imageSize ?? 'landscape_16_9',
    num_inference_steps: node.params?.steps ?? 28,
    guidance_scale: node.params?.guidanceScale ?? 3.5,
    num_images: node.params?.numImages ?? 1,
    settings: node.params?.settings,
    settings_override: node.params?.settings_override,
  };

  if (negativePrompt) {
    baseFalInputs.negative_prompt = negativePrompt;
  }

  // Add input image(s) if provided (for img2img / reference-to-image)
  if (referenceUrls.length > 0) {
    baseFalInputs.image_url = referenceUrls[0];
    baseFalInputs.image_urls = referenceUrls;
  } else if (inputs.image) {
    const imageUrl = typeof inputs.image === 'string'
      ? inputs.image
      : inputs.image.url ?? inputs.image;
    baseFalInputs.image_url = imageUrl;
    if (!baseFalInputs.image_urls) {
      baseFalInputs.image_urls = [imageUrl];
    }
  }

  if (cameraPayload) {
    baseFalInputs.camera = cameraPayload;
  }

  const merged = mergeFalModelInputs(resolvedModel.model.id, baseFalInputs);
  const model = merged.modelId;
  const falInputs = merged.inputs;

  console.log(`[ImageNode] Running ${model} with prompt: ${enhancedPrompt.substring(0, 150)}...`);

  send('node_progress', { 
    node_id: node.id, 
    progress: 10,
    message: 'Queuing image generation...'
  });

  try {
    const result = await fal.subscribe(model, {
      input: falInputs,
      logs: true,
      onQueueUpdate: (update: any) => {
        if (update.status === 'IN_PROGRESS') {
          const logCount = update.logs?.length ?? 0;
          send('node_progress', {
            node_id: node.id,
            progress: Math.min(90, 10 + logCount * 10),
            message: 'Generating image...',
            logs: update.logs?.slice(-3)
          });
        }
      }
    });

    // Extract image URL(s) from result
    let imageUrl: string | string[];
    const resultData = result as any;
    
    console.log('[ImageNode] FAL response keys:', Object.keys(resultData));
    
    // Handle wrapped response (data.images) - FAL v2 format
    const imageData = resultData.data || resultData;
    
    console.log('[ImageNode] Image data keys:', Object.keys(imageData));
    
    if (imageData.images && Array.isArray(imageData.images) && imageData.images.length > 0) {
      imageUrl = imageData.images.length === 1 
        ? imageData.images[0].url 
        : imageData.images.map((img: any) => img.url);
    } else if (imageData.image && imageData.image.url) {
      imageUrl = imageData.image.url;
    } else if (resultData.output && typeof resultData.output === 'string') {
      imageUrl = resultData.output;
    } else {
      console.error('[ImageNode] Unexpected FAL response structure:', JSON.stringify(resultData).substring(0, 500));
      throw new Error(`Image generation returned no image. Response structure: ${Object.keys(resultData).join(', ')}`);
    }

    console.log(`[ImageNode] Generated image(s):`, Array.isArray(imageUrl) ? imageUrl.length : 1);

    return { 
      type: 'image', 
      url: Array.isArray(imageUrl) ? imageUrl[0] : imageUrl,
      urls: Array.isArray(imageUrl) ? imageUrl : [imageUrl],
      model,
      prompt: enhancedPrompt,
      fallback_used: resolvedModel.fallbackUsed,
      fallback_reason: resolvedModel.fallbackReason,
    };

  } catch (error: any) {
    console.error('[ImageNode] FAL error details:', error);
    
    // Provide more helpful error messages
    let errorMessage = error.message || 'Unknown error';
    
    if (errorMessage.includes('No image')) {
      errorMessage = `Image generation failed - no image was returned. This usually means the prompt was rejected or the model encountered an issue. Try a more descriptive visual prompt.`;
    } else if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
      errorMessage = 'FAL.ai authentication failed. Please verify your FAL_KEY is correct.';
    } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
      errorMessage = 'FAL.ai rate limit reached. Please wait a moment and try again.';
    }
    
    throw new Error(`Image generation failed: ${errorMessage}`);
  }
}

async function executeVideoNode(
  node: ComputeNode,
  inputs: Record<string, any>,
  send: (event: string, data: Record<string, unknown>) => void
): Promise<any> {
  const rawModel = String(node.params?.model ?? 'fal-ai/kling-video/o3/standard/text-to-video');
  const prompt = node.params?.prompt ?? inputs.prompt ?? '';
  const shot = (node.params?.shot ?? undefined) as ShotControl | undefined;

  // Substitute input variables, then layer cinematic camera suffix
  const finalPrompt = compileCinematicPrompt(substituteVariables(prompt, inputs), shot, 'video');
  const referenceUrls = normalizeReferenceInputs(inputs);
  const cameraPayload = shotToCameraPayload(shot);
  const runtimeModel = await getCatalogModelById(rawModel);

  if (runtimeModel?.provider === 'gmi-cloud') {
    send('node_progress', {
      node_id: node.id,
      progress: 5,
      message: 'Submitting video generation to GMI Cloud...',
    });

    const imageUrl = referenceUrls[0]
      ?? (typeof inputs.image === 'string'
        ? inputs.image
        : typeof inputs.image_url === 'string'
          ? inputs.image_url
          : undefined);

    const payload: Record<string, unknown> = {
      prompt: finalPrompt,
      ...node.params?.settings,
      ...inputs,
      image_url: imageUrl,
      image_urls: referenceUrls.length > 0 ? referenceUrls : undefined,
      duration: node.params?.duration ?? inputs.duration,
      duration_seconds: node.params?.duration ?? inputs.duration_seconds,
      durationSeconds: node.params?.duration ?? inputs.durationSeconds,
      aspect_ratio: node.params?.aspectRatio ?? inputs.aspect_ratio,
      aspectRatio: node.params?.aspectRatio ?? inputs.aspectRatio,
      fps: node.params?.fps ?? inputs.fps,
      generate_audio: node.params?.generateAudio ?? inputs.generate_audio,
      generateAudio: node.params?.generateAudio ?? inputs.generateAudio,
      element_ids: node.params?.elementIds ?? inputs.element_ids,
      camera: cameraPayload,
    };

    const submitResult = await executeGmiQueueModel(runtimeModel.endpointId, payload, runtimeModel.payloadKeys);
    if (!submitResult.success || !submitResult.requestId) {
      throw new Error(submitResult.error ?? 'GMI video submission failed');
    }

    const finalResult = await pollGmiUntilComplete(submitResult.requestId, 'video', node.id, send);
    const media = extractGmiMedia(finalResult, 'video');
    if (!media.primaryUrl) {
      throw new Error('GMI video generation did not return a video URL');
    }

    return {
      type: 'video',
      url: media.primaryUrl,
      urls: media.outputs.map((entry) => entry.url),
      model: rawModel,
      endpoint_model: runtimeModel.endpointId,
      prompt: finalPrompt,
      element_id: media.elementId,
    };
  }

  if (runtimeModel?.provider === 'fal-ai') {
    return await executeFalCatalogNode(node, inputs, send, 'video', {
      prompt: finalPrompt,
      referenceUrls,
      camera: cameraPayload,
    });
  }

  if (runtimeModel && runtimeModel.transportType !== 'fal_queue' && runtimeModel.provider !== 'fal-ai') {
    throw new Error(`Unsupported video model transport: ${runtimeModel.transportType}`);
  }

  const FAL_KEY = Deno.env.get('FAL_KEY');
  
  if (!FAL_KEY) {
    throw new Error('FAL_KEY is not configured for legacy video execution');
  }

  fal.config({ credentials: FAL_KEY });

  const resolvedModel = resolveFalModelOrFallback(rawModel, {
    mediaTypeHint: 'video',
    uiGroup: 'generation',
  });

  const baseFalInputs: Record<string, any> = {
    prompt: finalPrompt,
    duration: node.params?.duration ?? '5',
    aspect_ratio: node.params?.aspectRatio ?? '16:9',
    fps: node.params?.fps,
    generate_audio: node.params?.generateAudio,
    settings: node.params?.settings,
    settings_override: node.params?.settings_override,
  };

  // Add input image if provided (for image-to-video / reference-to-video)
  if (referenceUrls.length > 0) {
    baseFalInputs.image_url = referenceUrls[0];
    baseFalInputs.start_image_url = referenceUrls[0];
    baseFalInputs.image_urls = referenceUrls;
  } else if (inputs.image) {
    const imageUrl = typeof inputs.image === 'string'
      ? inputs.image
      : inputs.image.url ?? inputs.image;
    baseFalInputs.image_url = imageUrl;
    if (!baseFalInputs.start_image_url) {
      baseFalInputs.start_image_url = imageUrl;
    }
  }

  if (cameraPayload) {
    baseFalInputs.camera = cameraPayload;
  }

  const merged = mergeFalModelInputs(resolvedModel.model.id, baseFalInputs);
  const model = merged.modelId;
  const falInputs = merged.inputs;

  console.log(`[VideoNode] Running ${model} with prompt: ${finalPrompt.substring(0, 100)}...`);

  send('node_progress', { 
    node_id: node.id, 
    progress: 5,
    message: 'Queuing video generation...'
  });

  try {
    const result = await fal.subscribe(model, {
      input: falInputs,
      logs: true,
      onQueueUpdate: (update: any) => {
        if (update.status === 'IN_PROGRESS') {
          const logCount = update.logs?.length ?? 0;
          send('node_progress', {
            node_id: node.id,
            progress: Math.min(90, 5 + logCount * 5),
            message: 'Generating video...',
            logs: update.logs?.slice(-3)
          });
        }
      }
    });

    // Extract video URL from result
    let videoUrl: string;
    const resultData = result as any;
    
    if (resultData.video) {
      videoUrl = resultData.video.url;
    } else if (resultData.url) {
      videoUrl = resultData.url;
    } else {
      throw new Error('No video in FAL response');
    }

    console.log(`[VideoNode] Generated video: ${videoUrl}`);

    return { 
      type: 'video', 
      url: videoUrl,
      model,
      prompt: finalPrompt,
      fallback_used: resolvedModel.fallbackUsed,
      fallback_reason: resolvedModel.fallbackReason,
    };

  } catch (error: any) {
    console.error('[VideoNode] FAL error:', error);
    throw new Error(`Video generation failed: ${error.message}`);
  }
}

async function executeAudioNode(
  node: ComputeNode,
  inputs: Record<string, any>,
  send: (event: string, data: Record<string, unknown>) => void
): Promise<any> {
  // Audio generation - could use ElevenLabs or FAL
  const model = String(node.params?.model ?? 'fal-ai/elevenlabs/tts/turbo-v2.5');
  const prompt = node.params?.prompt ?? inputs.prompt ?? '';
  const finalPrompt = substituteVariables(prompt, inputs);
  const runtimeModel = await getCatalogModelById(model);

  if (runtimeModel?.provider === 'gmi-cloud') {
    send('node_progress', {
      node_id: node.id,
      progress: 5,
      message: 'Submitting audio generation to GMI Cloud...',
    });

    const payload: Record<string, unknown> = {
      prompt: finalPrompt,
      text: finalPrompt,
      ...node.params?.settings,
      ...inputs,
      audio_url: typeof inputs.audio === 'string' ? inputs.audio : inputs.audio_url,
      voice_sample: typeof inputs.audio === 'string' ? inputs.audio : inputs.audio_url,
      language: node.params?.language ?? inputs.language,
      speed: node.params?.speed ?? inputs.speed,
    };

    const submitResult = await executeGmiQueueModel(runtimeModel.endpointId, payload, runtimeModel.payloadKeys);
    if (!submitResult.success || !submitResult.requestId) {
      throw new Error(submitResult.error ?? 'GMI audio submission failed');
    }

    const finalResult = await pollGmiUntilComplete(submitResult.requestId, 'audio', node.id, send);
    const media = extractGmiMedia(finalResult, 'unknown');
    const audioUrl = media.primaryUrl ?? extractOutputValue(finalResult);
    if (typeof audioUrl !== 'string' || audioUrl.length === 0) {
      throw new Error('GMI audio generation did not return an audio URL');
    }

    return {
      type: 'audio',
      url: audioUrl,
      model,
      endpoint_model: runtimeModel.endpointId,
      prompt: finalPrompt,
    };
  }

  if (runtimeModel?.transportType === 'edge_function') {
    const functionName = getEdgeFunctionName(runtimeModel);
    if (!functionName) {
      throw new Error(`Model ${model} is missing an edge function mapping`);
    }

    const response = await invokeLocalEdgeFunction(functionName, functionName === 'elevenlabs-tts'
      ? {
          text: finalPrompt,
          voiceId: node.params?.voiceId,
          modelId: node.params?.modelId,
        }
      : {
          prompt: finalPrompt,
          duration: node.params?.duration ?? (functionName === 'elevenlabs-music' ? 30 : 5),
        });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    const audioBuffer = await response.arrayBuffer();
    const audioUrl = arrayBufferToDataUrl(contentType, audioBuffer);

    return {
      type: 'audio',
      url: audioUrl,
      model,
      endpoint_model: functionName,
      prompt: finalPrompt,
    };
  }

  if (runtimeModel?.provider === 'fal-ai') {
    return await executeFalCatalogNode(node, inputs, send, 'audio', {
      prompt: finalPrompt,
    });
  }

  if (!runtimeModel || runtimeModel.transportType === 'fal_queue' || runtimeModel.provider === 'fal-ai') {
    const FAL_KEY = Deno.env.get('FAL_KEY');
    if (!FAL_KEY) {
      throw new Error('FAL_KEY is not configured for audio execution');
    }

    fal.config({ credentials: FAL_KEY });

    const resolvedModel = resolveFalModelOrFallback(model, {
      mediaTypeHint: 'audio',
      uiGroup: 'generation',
    });

    const audioUrl = typeof inputs.audio === 'string' ? inputs.audio : inputs.audio_url;
    const baseFalInputs: Record<string, any> = {
      prompt: finalPrompt,
      text: finalPrompt,
      voice_id: node.params?.voiceId ?? node.params?.voice_id ?? inputs.voice_id,
      voiceId: node.params?.voiceId ?? inputs.voiceId,
      language: node.params?.language ?? inputs.language,
      speed: node.params?.speed ?? inputs.speed,
      duration: node.params?.duration ?? inputs.duration,
      audio_url: audioUrl,
      settings: node.params?.settings,
      settings_override: node.params?.settings_override,
    };

    const merged = mergeFalModelInputs(resolvedModel.model.id, baseFalInputs);

    send('node_progress', {
      node_id: node.id,
      progress: 10,
      message: 'Queuing audio generation...',
    });

    const result = await fal.subscribe(merged.modelId, {
      input: merged.inputs,
      logs: true,
      onQueueUpdate: (update: any) => {
        if (update.status === 'IN_PROGRESS') {
          const logCount = update.logs?.length ?? 0;
          send('node_progress', {
            node_id: node.id,
            progress: Math.min(90, 10 + logCount * 10),
            message: 'Generating audio...',
            logs: update.logs?.slice(-3),
          });
        }
      },
    });

    const resultData = ((result as any).data ?? result) as any;
    const generatedAudioUrl =
      resultData?.audio?.url ??
      resultData?.file?.url ??
      resultData?.url ??
      resultData?.audio_url ??
      resultData?.output ??
      (Array.isArray(resultData?.audios) ? resultData.audios[0]?.url : undefined) ??
      (Array.isArray(resultData?.files) ? resultData.files[0]?.url : undefined);

    if (typeof generatedAudioUrl !== 'string' || generatedAudioUrl.length === 0) {
      throw new Error(`Audio generation returned no audio. Response structure: ${Object.keys(resultData ?? {}).join(', ')}`);
    }

    return {
      type: 'audio',
      url: generatedAudioUrl,
      model: merged.modelId,
      prompt: finalPrompt,
      fallback_used: resolvedModel.fallbackUsed,
      fallback_reason: resolvedModel.fallbackReason,
    };
  }

  throw new Error(`Unsupported audio model transport for ${model}`);
}
