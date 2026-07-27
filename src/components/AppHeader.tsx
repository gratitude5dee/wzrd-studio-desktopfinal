import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { 
  Settings, 
  Coins, 
  Home, 
  FilePlus, 
  Copy, 
  Pencil, 
  Undo, 
  Redo, 
  Maximize,
  ZoomIn,
  ZoomOut,
  ChevronDown
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabaseService } from '@/services/supabaseService';
import { Input } from '@/components/ui/input';
import { z } from 'zod';
import CreditsDisplay from '@/components/CreditsDisplay';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ProjectSharePopover } from '@/components/share/ProjectSharePopover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuShortcut,
} from '@/components/ui/dropdown-menu';
import { appRoutes, getCanonicalProjectRoute } from '@/lib/routes';
import { useUserTier } from '@/hooks/useUserTier';
import {
  PROJECT_PIPELINE_STAGES,
  getProjectStageFromPath,
  getProjectStageRoute,
  getProjectStageStatuses,
  type ProjectPipelineStage,
  type ProjectPipelineStageStatus,
} from '@/lib/projectStages';

const PlanBadge = () => {
  const navigate = useNavigate();
  const { tier, isLoading } = useUserTier();
  if (isLoading) return null;
  const isFree = tier === 'free';
  return (
    <button
      onClick={() => navigate(appRoutes.systemBilling)}
      className={cn(
        'hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide border transition-colors',
        isFree
          ? 'bg-zinc-900/60 text-zinc-300 border-zinc-700 hover:bg-[rgba(249,115,22,0.08)] hover:border-[rgba(249,115,22,0.3)] hover:text-[#f97316]'
          : 'bg-[rgba(249,115,22,0.12)] text-[#f97316] border-[rgba(249,115,22,0.3)]'
      )}
      title={isFree ? 'Free plan — click to upgrade' : `Plan: ${tier}`}
    >
      {isFree ? 'Free · Upgrade' : tier}
    </button>
  );
};

interface AppHeaderProps {
  className?: string;
  showShareButton?: boolean;
  onOpenSettings?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomToFit?: () => void;
}

export const AppHeader = ({ 
  className, 
  showShareButton = true,
  onOpenSettings,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
}: AppHeaderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ projectId?: string }>();
  const projectIdFromQuery = useMemo(() => {
    return new URLSearchParams(location.search).get('projectId') || undefined;
  }, [location.search]);
  const projectIdFromURL = params.projectId || projectIdFromQuery;
  
  const { activeProjectId, activeProjectName, setActiveProject, fetchMostRecentProject } = useAppStore();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [projectRecord, setProjectRecord] = useState<Record<string, unknown> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const titleSchema = z.string()
    .trim()
    .min(1, 'Title cannot be empty')
    .max(100, 'Title must be less than 100 characters');

  const getCurrentStage = (): ProjectPipelineStage => {
    const currentRouteStage = getProjectStageFromPath(location.pathname);
    if (currentRouteStage) {
      return currentRouteStage;
    }
    return 'studio';
  };

  const currentStage = getCurrentStage();
  const stageStatuses = useMemo(
    () => getProjectStageStatuses(projectRecord, currentStage),
    [currentStage, projectRecord]
  );

  useEffect(() => {
    if (projectIdFromURL && projectIdFromURL !== activeProjectId) {
      const fetchProjectName = async () => {
        try {
          const project = await supabaseService.projects.find(projectIdFromURL);
          setProjectRecord(project ? (project as unknown as Record<string, unknown>) : null);
          setActiveProject(projectIdFromURL, project?.title || 'Untitled');
        } catch {
          // Keep navigation usable even when the project title lookup fails.
          setProjectRecord(null);
        }
      };
      
      fetchProjectName();
    } else {
      setProjectRecord(null);
    }
  }, [projectIdFromURL, activeProjectId, setActiveProject]);

  const handleNavigate = async (stage: ProjectPipelineStage) => {
    const projectId = projectIdFromURL || activeProjectId;

    if (!projectId) {
      const recentProjectId = await fetchMostRecentProject();
      
      if (recentProjectId) {
        navigate(getProjectStageRoute(stage, recentProjectId));
      } else {
        toast.warning('Please select or create a project first');
        navigate(appRoutes.home);
      }
    } else {
      navigate(getProjectStageRoute(stage, projectId));
    }
  };

  const getButtonClass = (stage: ProjectPipelineStage) => {
    return cn(
      'h-7 shrink-0 gap-1.5 rounded-md px-2 text-xs transition-colors duration-200',
      currentStage === stage
        ? 'bg-[rgba(249,115,22,0.12)] text-[#f97316]' 
        : 'text-zinc-500 hover:text-white hover:bg-white/5'
    );
  };

  const getStageDotClass = (status: ProjectPipelineStageStatus) => cn(
    'h-1.5 w-1.5 rounded-full',
    status === 'current' && 'bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.65)]',
    status === 'complete' && 'bg-[#f97316]',
    status === 'incomplete' && 'bg-rose-400',
    status === 'unknown' && 'bg-zinc-600'
  );

  const handleLogoClick = () => {
    navigate(appRoutes.home);
  };

  const resolvedProjectId = projectIdFromURL || activeProjectId;

  const startEditing = () => {
    setEditValue(activeProjectName || 'Untitled');
    setIsEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditValue('');
  };

  const saveTitle = async () => {
    const projectId = projectIdFromURL || activeProjectId;
    if (!projectId) {
      toast.error('No project selected');
      cancelEditing();
      return;
    }

    try {
      const validatedTitle = titleSchema.parse(editValue);
      
      await supabaseService.projects.update(projectId, {
        title: validatedTitle,
      });

      setActiveProject(projectId, validatedTitle);
      toast.success('Project title updated');
      setIsEditing(false);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.issues[0].message);
      } else {
        toast.error('Failed to update project title');
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveTitle();
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  // Dropdown menu handlers
  const handleBackToHome = () => navigate(appRoutes.home);
  const handleOpenBilling = () => navigate(appRoutes.systemBilling);
  const handleNewProject = async () => {
    try {
      const newProjectId = await supabaseService.projects.create({
        title: 'Untitled Project',
      });
      if (newProjectId) {
        navigate(appRoutes.projects.studio(newProjectId));
        toast.success('New project created');
      }
    } catch {
      toast.error('Failed to create project');
    }
  };
  const handleDuplicateProject = async () => {
    if (!resolvedProjectId) {
      toast.error('No project to duplicate');
      return;
    }
    toast.info('Duplicating project...');
    // Note: duplicate functionality would need to be implemented in supabaseService
  };

  return (
    <TooltipProvider delayDuration={300}>
      <header className={cn(
        'w-full h-14 bg-zinc-950/80 backdrop-blur-xl border-b border-[rgba(249,115,22,0.08)] px-4 flex items-center justify-between relative z-50',
        className
      )}>
        {/* Left: Logo + Project Name */}
        <div className="flex items-center gap-3">
          <div onClick={handleLogoClick} className="cursor-pointer">
            <Logo size="sm" showVersion={false} />
          </div>
          
          <div className="h-4 w-px bg-zinc-800" />
          
          {isEditing ? (
            <Input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={handleKeyDown}
              className="h-7 text-sm font-medium bg-zinc-900 border-zinc-700 text-white max-w-[200px]"
            />
          ) : (
            <span 
              className="text-sm font-medium text-zinc-300 cursor-text hover:text-white transition-colors"
              onClick={startEditing}
              title="Click to edit project name"
            >
              {activeProjectName || 'Untitled'}
            </span>
          )}
        </div>

        {/* Center: project pipeline stage switcher */}
        <div className="absolute left-1/2 hidden max-w-[min(720px,calc(100vw-520px))] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-lg bg-zinc-900/50 p-0.5 lg:flex">
          {PROJECT_PIPELINE_STAGES.map((stage) => (
            <Button
              key={stage.id}
              variant="ghost"
              size="sm"
              className={getButtonClass(stage.id)}
              onClick={() => handleNavigate(stage.id)}
              title={stage.label}
            >
              <span className={getStageDotClass(stageStatuses[stage.id])} />
              <span className="hidden xl:inline">{stage.label}</span>
              <span className="xl:hidden">{stage.shortLabel}</span>
            </Button>
          ))}
        </div>

        {/* Right: Plan badge + Credits + Settings Dropdown + Share */}
        <div className="flex items-center gap-2">
          {/* Plan badge */}
          <PlanBadge />

          {/* Credits Display */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900/60 border border-[rgba(249,115,22,0.12)] rounded-lg">
            <Coins className="w-3.5 h-3.5 text-accent-teal" />
            <CreditsDisplay showTooltip={false} />
          </div>

          {/* Settings Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-zinc-400 hover:text-white hover:bg-zinc-800/50 gap-1"
              >
                <Settings className="h-4 w-4" />
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              align="end" 
              className="w-56 bg-[#0f0f13] border-[rgba(249,115,22,0.15)] text-white"
              sideOffset={8}
            >
              <DropdownMenuItem onClick={handleBackToHome} className="hover:bg-[rgba(249,115,22,0.06)] cursor-pointer">
                <Home className="mr-2 h-4 w-4" />
                Back to home
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleOpenBilling} className="hover:bg-[rgba(249,115,22,0.06)] cursor-pointer">
                <Coins className="mr-2 h-4 w-4" />
                Billing & credits
              </DropdownMenuItem>
              
              <DropdownMenuSeparator className="bg-zinc-800" />
              
              <DropdownMenuItem onClick={handleNewProject} className="hover:bg-zinc-800 cursor-pointer">
                <FilePlus className="mr-2 h-4 w-4" />
                New project
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDuplicateProject} className="hover:bg-[rgba(249,115,22,0.06)] cursor-pointer">
                <Copy className="mr-2 h-4 w-4" />
                Duplicate project
              </DropdownMenuItem>
              <DropdownMenuItem onClick={startEditing} className="hover:bg-[rgba(249,115,22,0.06)] cursor-pointer">
                <Pencil className="mr-2 h-4 w-4" />
                Rename project
              </DropdownMenuItem>
              
              <DropdownMenuSeparator className="bg-[rgba(249,115,22,0.1)]" />
              
              <DropdownMenuItem 
                onClick={onUndo} 
                disabled={!onUndo}
                className="hover:bg-[rgba(249,115,22,0.06)] cursor-pointer"
              >
                <Undo className="mr-2 h-4 w-4" />
                Undo
                <DropdownMenuShortcut>⌘Z</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={onRedo}
                disabled={!onRedo}
                className="hover:bg-[rgba(249,115,22,0.06)] cursor-pointer"
              >
                <Redo className="mr-2 h-4 w-4" />
                Redo
                <DropdownMenuShortcut>⌘⇧Z</DropdownMenuShortcut>
              </DropdownMenuItem>
              
              <DropdownMenuSeparator className="bg-[rgba(249,115,22,0.1)]" />
              
              <DropdownMenuItem onClick={onOpenSettings} className="hover:bg-[rgba(249,115,22,0.06)] cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                Project settings
              </DropdownMenuItem>
              
              <DropdownMenuSeparator className="bg-[rgba(249,115,22,0.1)]" />
              
              <DropdownMenuItem 
                onClick={onZoomToFit}
                disabled={!onZoomToFit}
                className="hover:bg-[rgba(249,115,22,0.06)] cursor-pointer"
              >
                <Maximize className="mr-2 h-4 w-4" />
                Zoom to fit
                <DropdownMenuShortcut>⌘1</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={onZoomIn}
                disabled={!onZoomIn}
                className="hover:bg-[rgba(249,115,22,0.06)] cursor-pointer"
              >
                <ZoomIn className="mr-2 h-4 w-4" />
                Zoom in
                <DropdownMenuShortcut>⌘+</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={onZoomOut}
                disabled={!onZoomOut}
                className="hover:bg-[rgba(249,115,22,0.06)] cursor-pointer"
              >
                <ZoomOut className="mr-2 h-4 w-4" />
                Zoom out
                <DropdownMenuShortcut>⌘-</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Share Button */}
          {showShareButton && (
            <ProjectSharePopover
              projectId={resolvedProjectId}
              projectName={activeProjectName || 'Untitled'}
              className="h-10 rounded-[14px] bg-[#8FD97D] px-4 text-sm font-semibold text-[#0D130D] shadow-[0_10px_24px_rgba(143,217,125,0.18)] hover:bg-[#9ce38b]"
            />
          )}
        </div>
      </header>
    </TooltipProvider>
  );
};

export default AppHeader;
