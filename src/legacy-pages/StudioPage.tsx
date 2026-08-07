import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, PanelLeft, PanelRight, Monitor } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import AppHeader from '@/components/AppHeader';
import StudioSidebar from '@/components/studio/StudioSidebar';
import StudioCanvas from '@/components/studio/StudioCanvas';
import { StudioErrorBoundary } from '@/components/studio/StudioErrorBoundary';
import { SettingsPanel } from '@/components/studio/panels/SettingsPanel';
import { StudioRightPanel } from '@/components/studio/StudioRightPanel';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { appRoutes } from '@/lib/routes';

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useComputeFlowStore } from '@/store/computeFlowStore';
import type { AssetType } from '@/types/assets';
import type { Asset } from '@/components/studio/panels/AssetsGalleryPanel';
import type { NodeDefinition, EdgeDefinition } from '@/types/computeFlow';
import { v4 as uuidv4 } from 'uuid';
import { useStudioGraphActions, type StudioNodeType, type StudioNodeSeedOptions } from '@/hooks/studio/useStudioGraphActions';
import { useRegisterVoiceActions } from '@/voice/VoiceAgentProvider';
import type { VoiceActionRegistration } from '@/voice/actions/registry';

const StudioPage = () => {
  const { projectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { setActiveProject } = useAppStore();
  const { addGeneratedWorkflow, addNode, createNode, saveGraph, executeGraphStreaming } = useComputeFlowStore();
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [, setRightPanelWidth] = useState(56);
  const { addNodeOfType, addActionNode, scheduleSave } = useStudioGraphActions(projectId);

  const handleWorkflowGenerated = useCallback(
    async (nodes: NodeDefinition[], edges: EdgeDefinition[]) => {
      const workflowImport = addGeneratedWorkflow(nodes, edges, { fitViewOnFlush: true });
      if (!projectId) return;
      await workflowImport.flushed;
      await saveGraph(projectId);
      toast.info('Workflow saved! Starting generation...');
      void executeGraphStreaming(projectId, workflowImport.nodeIds);
    },
    [addGeneratedWorkflow, saveGraph, projectId, executeGraphStreaming]
  );

  useEffect(() => {
    const initializeProject = async () => {
      if (!projectId) {
        setIsLoading(false);
        return;
      }
      try {
        const { data: projectData, error: projectError } = await supabase
          .from('projects')
          .select('title')
          .eq('id', projectId)
          .single();
        if (projectError) throw projectError;
        setActiveProject(projectId, projectData?.title || 'Untitled');
      } catch (error) {
        console.error('Error initializing project:', error);
        toast.error('Failed to load project state');
      } finally {
        setIsLoading(false);
      }
    };
    initializeProject();
  }, [projectId, setActiveProject]);

  const handleAddNode = useCallback(
    (type: StudioNodeType, positionOrSeed?: { x: number; y: number } | StudioNodeSeedOptions, maybeSeed?: StudioNodeSeedOptions) => {
      let position: { x: number; y: number } | undefined;
      let seed: StudioNodeSeedOptions | undefined;

      if (positionOrSeed && 'x' in positionOrSeed && 'y' in positionOrSeed) {
        position = positionOrSeed as { x: number; y: number };
        seed = maybeSeed;
      } else {
        seed = positionOrSeed as StudioNodeSeedOptions | undefined;
      }

      const actionId = typeof seed?.params?.actionId === 'string' ? seed.params.actionId : undefined;
      if (actionId) {
        const actionNode = addActionNode(actionId, position ?? {
          x: 360 + Math.random() * 220,
          y: 220 + Math.random() * 220,
        }, seed);
        if (actionNode) {
          setSelectedNodeId(actionNode.id);
        }
        return;
      }

      const node = addNodeOfType(type, position ?? {
        x: 360 + Math.random() * 220,
        y: 220 + Math.random() * 220,
      }, seed);
      setSelectedNodeId(node.id);
    },
    [addActionNode, addNodeOfType]
  );

  const handleAssetInsert = useCallback(
    (asset: Asset) => {
      const assetUrl = asset.url;
      if (!assetUrl) {
        toast.error('Asset is still processing. Try again in a moment.');
        return;
      }
      const kindMap: Record<string, NodeDefinition['kind']> = {
        image: 'Image',
        video: 'Video',
        audio: 'Transform',
      };
      const newNode: NodeDefinition = {
        id: uuidv4(),
        kind: kindMap[asset.type] || 'Transform',
        version: '1.0',
        label: asset.name || asset.type,
        position: { x: 400 + Math.random() * 200, y: 300 + Math.random() * 200 },
        params: {
          assetId: asset.id,
          assetType: asset.type as AssetType,
          assetUrl,
          prompt: asset.name,
          imageUrl: asset.type === 'image' ? assetUrl : undefined,
        },
        inputs: [],
        outputs: [{ id: `${uuidv4()}-out-0`, name: asset.type, datatype: (asset.type === 'image' || asset.type === 'video' || asset.type === 'audio' ? asset.type : 'any') as any, cardinality: '1' as const, position: 'right' as const }],
        status: 'idle',
        progress: 0,
      };
      addNode(newNode);
      scheduleSave();
      setSelectedNodeId(newNode.id);
      toast.success(`${asset.type.charAt(0).toUpperCase() + asset.type.slice(1)} asset added to the canvas.`);
    },
    [addNode, scheduleSave]
  );

  const voiceActions = useMemo<VoiceActionRegistration[]>(
    () => [
      {
        name: 'studio_create_node',
        scope: 'studio',
        confirmation: {
          risk: 'write',
          message: 'This will add a node to the Studio graph. Should I continue?',
        },
        handler: (input) => {
          const payload = input as {
            type?: StudioNodeType;
            x?: number;
            y?: number;
            seed?: StudioNodeSeedOptions;
          };
          if (!payload.type) {
            return {
              ok: false,
              status: 'invalid_input',
              message: 'Tell me which Studio node type to create.',
              errorCode: 'studio_node_type_missing',
            };
          }
          handleAddNode(
            payload.type,
            typeof payload.x === 'number' && typeof payload.y === 'number'
              ? { x: payload.x, y: payload.y }
              : payload.seed,
          );
          return {
            ok: true,
            status: 'completed',
            message: `${payload.type} node added.`,
          };
        },
      },
      {
        name: 'studio_select_node',
        scope: 'studio',
        handler: (input) => {
          const payload = input as { nodeId?: string | null };
          if (!payload.nodeId) {
            return {
              ok: false,
              status: 'invalid_input',
              message: 'Tell me which node to select.',
              errorCode: 'studio_node_id_missing',
            };
          }
          setSelectedNodeId(payload.nodeId);
          return {
            ok: true,
            status: 'completed',
            message: 'Studio node selected.',
            data: { selectedNodeId: payload.nodeId },
          };
        },
      },
    ],
    [handleAddNode],
  );

  useRegisterVoiceActions(voiceActions);

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a] text-white">
      <AppHeader onOpenSettings={() => setIsSettingsPanelOpen(true)} />

      {/* Mobile read-mostly banner + sheet triggers */}
      {isMobile && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#0f0f0f] border-b border-zinc-800/60">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 border-zinc-800 bg-[#141414]">
                <PanelLeft className="h-4 w-4 mr-1" /> Tools
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[88vw] max-w-sm p-0 bg-[#0a0a0a] border-zinc-800 overflow-y-auto">
              <StudioSidebar
                onAddBlock={handleAddNode}
                projectId={projectId}
                interactionMode="select"
                onToggleInteractionMode={() => {}}
              />
            </SheetContent>
          </Sheet>

          <div className="flex-1 text-center text-[11px] text-zinc-400">
            <Monitor className="inline h-3 w-3 mr-1" />
            Studio works best on desktop
            {projectId && (
              <button
                onClick={() => navigate(appRoutes.projects.timeline(projectId))}
                className="ml-2 underline text-orange-400"
              >
                Open Timeline
              </button>
            )}
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 border-zinc-800 bg-[#141414]">
                <PanelRight className="h-4 w-4 mr-1" /> Inspect
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[92vw] max-w-md p-0 bg-[#0a0a0a] border-zinc-800 overflow-y-auto">
              <StudioRightPanel
                projectId={projectId}
                selectedNodeId={selectedNodeId}
                onClearSelection={() => setSelectedNodeId(null)}
                onAssetSelect={handleAssetInsert}
                onWidthChange={setRightPanelWidth}
                onCreateNode={handleAddNode}
                onWorkflowGenerated={handleWorkflowGenerated}
              />
            </SheetContent>
          </Sheet>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {!isMobile && (
          <StudioSidebar
            onAddBlock={handleAddNode}
            projectId={projectId}
            interactionMode="select"
            onToggleInteractionMode={() => {}}
          />
        )}

        <StudioErrorBoundary
          fallbackTitle="Studio Failed to Load"
          fallbackDescription="The Studio editor hit a runtime error. You can retry from this page."
          onReset={() => setSelectedNodeId(null)}
        >
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 flex bg-[#0a0a0a]">
              {isLoading ? (
                <div className="flex-1 flex items-center justify-center bg-black">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-[#d4a574]" />
                    <p className="text-sm text-zinc-400">Loading project...</p>
                  </div>
                </div>
              ) : (
                <StudioCanvas
                  projectId={projectId}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={setSelectedNodeId}
                />
              )}
            </div>

            {!isMobile && (
              <StudioRightPanel
                projectId={projectId}
                selectedNodeId={selectedNodeId}
                onClearSelection={() => setSelectedNodeId(null)}
                onAssetSelect={handleAssetInsert}
                onWidthChange={setRightPanelWidth}
                onCreateNode={handleAddNode}
                onWorkflowGenerated={handleWorkflowGenerated}
              />
            )}
          </div>
        </StudioErrorBoundary>
      </div>

      {isSettingsPanelOpen && projectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <SettingsPanel projectId={projectId} onClose={() => setIsSettingsPanelOpen(false)} />
        </div>
      )}
    </div>
  );
};

export default StudioPage;
