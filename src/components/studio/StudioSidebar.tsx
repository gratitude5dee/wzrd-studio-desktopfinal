import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Plus,
  History,
  HelpCircle,
  Workflow,
  MessageCircle,
  Hand,
  MousePointer,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { FlowsPanel } from './panels/FlowsPanel';
import { HistoryPanel } from './panels/HistoryPanel';
import { WalkthroughTooltip } from './panels/HelpWalkthroughPanel';
import { useWalkthrough } from '@/hooks/useWalkthrough';
import { useComputeFlowStore } from '@/store/computeFlowStore';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { ShineBorder } from '@/components/ui/shine-border';
import { StudioNodePalette } from './StudioNodePalette';
import type { StudioNodeType, StudioNodeSeedOptions } from '@/hooks/studio/useStudioGraphActions';

interface StudioSidebarProps {
  onAddBlock: (blockType: StudioNodeType, seed?: StudioNodeSeedOptions) => void;
  projectId?: string;
  interactionMode?: 'pan' | 'select';
  onToggleInteractionMode?: () => void;
}

type PanelType = 'add' | 'flows' | 'history' | null;

const StudioSidebar = ({ 
  onAddBlock, 
  projectId, 
  interactionMode = 'pan',
  onToggleInteractionMode 
}: StudioSidebarProps) => {
  const { addNode } = useComputeFlowStore();
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const walkthrough = useWalkthrough();
  const panelRef = useRef<HTMLDivElement>(null);

  const togglePanel = (panel: PanelType) => {
    setActivePanel((current) => (current === panel ? null : panel));
  };

  const handleAddComment = useCallback(() => {
    addNode({
      id: crypto.randomUUID(),
      kind: 'comment',
      version: '1.0.0',
      label: 'Comment',
      position: { x: 250, y: 250 },
      size: { w: 300, h: 180 },
      inputs: [],
      outputs: [],
      status: 'idle',
      params: {
        title: 'New Comment',
        content: '',
        color: '#FBBF24',
      },
    });
    toast.success('Comment added to canvas');
  }, [addNode]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setActivePanel(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      {/* Floating Sidebar - Vertically Centered - Reduced width - Moved right by 5px */}
      <aside className="fixed left-[10px] top-1/2 -translate-y-1/2 z-40">
        <motion.div 
          className="relative flex flex-col items-center gap-0 rounded-2xl border border-white/10 bg-[#141414]/94 p-1 shadow-2xl shadow-black/40 backdrop-blur-2xl"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Primary Add Node Button with ShineBorder */}
          <div className="relative">
            <SidebarButton
              icon={Plus}
              label="Add Node"
              active={activePanel === 'add'}
              onClick={() => togglePanel('add')}
              data-walkthrough="add-button"
              primary
            />
            {activePanel === 'add' && (
              <ShineBorder 
                shineColor={["#d4a574", "#f97316"]} 
                borderWidth={2}
                duration={4}
              />
            )}
          </div>

          <Divider />

          {/* Pan/Select Mode Toggle */}
          {onToggleInteractionMode && (
            <div className="relative">
              <SidebarButton
                icon={interactionMode === 'pan' ? Hand : MousePointer}
                label={interactionMode === 'pan' ? 'Pan Mode (H)' : 'Select Mode (V)'}
                active={interactionMode === 'select'}
                onClick={onToggleInteractionMode}
                modeIndicator={interactionMode}
              />
            </div>
          )}

          <SidebarButton
            icon={Workflow}
            label="Flows"
            active={activePanel === 'flows'}
            onClick={() => togglePanel('flows')}
            data-walkthrough="flows-button"
          />

          <SidebarButton
            icon={History}
            label="History"
            active={activePanel === 'history'}
            onClick={() => togglePanel('history')}
            data-walkthrough="history-button"
          />

          <Divider />

          <SidebarButton icon={MessageCircle} label="Add Comment" onClick={handleAddComment} />

          <SidebarButton 
            icon={HelpCircle} 
            label="Help & Tour" 
            onClick={() => walkthrough.start()} 
          />

        </motion.div>
      </aside>

      {/* Panels Container */}
      <div ref={panelRef}>
        <AnimatePresence mode="wait">
          {activePanel === 'add' && (
            <PanelWrapper>
              <AddNodeMenu
                onAddBlock={(type, seed) => {
                  onAddBlock(type, seed);
                  setActivePanel(null);
                }}
              />
            </PanelWrapper>
          )}

          {activePanel === 'flows' && projectId && (
            <PanelWrapper>
              <FlowsPanel projectId={projectId} onClose={() => setActivePanel(null)} />
            </PanelWrapper>
          )}

          {activePanel === 'history' && (
            <PanelWrapper>
              <HistoryPanel onClose={() => setActivePanel(null)} />
            </PanelWrapper>
          )}

        </AnimatePresence>
      </div>

      <AnimatePresence>
        {walkthrough.isActive && walkthrough.currentStep && (
          <WalkthroughTooltip
            step={walkthrough.currentStep}
            onNext={walkthrough.next}
            onPrev={walkthrough.prev}
            onClose={walkthrough.stop}
            currentIndex={walkthrough.currentStepIndex}
            totalSteps={walkthrough.totalSteps}
          />
        )}
      </AnimatePresence>
    </TooltipProvider>
  );
};

const Divider = () => (
  <div className="w-8 h-px bg-gradient-to-r from-transparent via-border-subtle to-transparent my-1.5" />
);

interface SidebarButtonProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick: () => void;
  accent?: boolean;
  primary?: boolean;
  badge?: number;
  modeIndicator?: 'pan' | 'select';
  'data-walkthrough'?: string;
}

const SidebarButton: React.FC<SidebarButtonProps> = ({
  icon: Icon,
  label,
  active,
  onClick,
  accent,
  primary,
  badge,
  modeIndicator,
  ...props
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <motion.button
        onClick={onClick}
        className={cn(
          'relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-200',
          primary
            ? 'bg-[#221a10] text-white shadow-lg shadow-black/30'
            : active
              ? 'bg-[#251c0e] text-[#f97316]'
              : modeIndicator === 'select'
                ? 'bg-[#251c0e] text-[#f97316]'
                : accent
                  ? 'text-zinc-400 hover:bg-[#1c1c1c] hover:text-[#d4a574]'
                  : 'text-zinc-400 hover:bg-[#1c1c1c] hover:text-white'
        )}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        {...props}
      >
        <Icon className="w-4 h-4" />
        {badge !== undefined && badge > 0 && (
          <motion.span 
            className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#7d3939] text-[10px] font-bold text-white"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
          >
            {badge}
          </motion.span>
        )}
        {modeIndicator && (
          <motion.span 
            className={cn(
              'absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full',
              modeIndicator === 'pan' ? 'bg-zinc-500' : 'bg-[#f97316]'
            )}
            layoutId="mode-indicator"
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        )}
      </motion.button>
    </TooltipTrigger>
    <TooltipContent side="right" className="border-white/10 bg-[#121212] text-xs text-zinc-100">
      {label}
    </TooltipContent>
  </Tooltip>
);

interface PanelWrapperProps {
  children: React.ReactNode;
  offsetY?: number;
}

const PanelWrapper: React.FC<PanelWrapperProps> = ({ children, offsetY = 0 }) => (
  <motion.div
    className="fixed left-[60px] top-1/2 z-50"
    style={{ transform: `translateY(calc(-50% + ${offsetY}px))` }}
    initial={{ opacity: 0, x: -16, scale: 0.96 }}
    animate={{ opacity: 1, x: 0, scale: 1 }}
    exit={{ opacity: 0, x: -16, scale: 0.96 }}
    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
  >
    {/* Arrow connector pointing back to sidebar */}
    <div className="absolute -left-2 top-1/2 h-0 w-0 -translate-y-1/2 border-b-[6px] border-b-transparent border-r-[8px] border-r-[#141414] border-t-[6px] border-t-transparent" />
    {children}
  </motion.div>
);

const AddNodeMenu: React.FC<{
  onAddBlock: (type: StudioNodeType, seed?: StudioNodeSeedOptions) => void;
}> = ({ onAddBlock }) => {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
      <StudioNodePalette onCreateNode={onAddBlock} variant="menu" />
    </motion.div>
  );
};

export default StudioSidebar;
