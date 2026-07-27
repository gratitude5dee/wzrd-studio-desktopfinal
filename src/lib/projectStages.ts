import { appRoutes, getCanonicalProjectRoute, getProjectViewFromPath, type CoreProjectView } from '@/lib/routes';

export type ProjectPipelineStage = 'setup' | CoreProjectView;
export type ProjectPipelineStageStatus = 'current' | 'complete' | 'incomplete' | 'unknown';

export interface ProjectPipelineStageDefinition {
  id: ProjectPipelineStage;
  label: string;
  shortLabel: string;
}

export const PROJECT_PIPELINE_STAGES: ProjectPipelineStageDefinition[] = [
  { id: 'setup', label: 'Setup', shortLabel: 'Setup' },
  { id: 'studio', label: 'Studio', shortLabel: 'Studio' },
  { id: 'timeline', label: 'Storyboard', shortLabel: 'Board' },
  { id: 'editor', label: 'Editor', shortLabel: 'Edit' },
  { id: 'directors-cut', label: "Director's Cut", shortLabel: 'Cut' },
];

type ProjectStageRecord = Record<string, unknown> | null | undefined;

function booleanFlag(record: ProjectStageRecord, key: string): boolean | null {
  if (!record || typeof record[key] !== 'boolean') return null;
  return record[key] as boolean;
}

function hasValue(record: ProjectStageRecord, key: string): boolean {
  const value = record?.[key];
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function completionFromFlag(flag: boolean | null, fallback: boolean | null = null): boolean | null {
  if (flag !== null) return flag;
  return fallback;
}

export function getProjectStageRoute(stage: ProjectPipelineStage, projectId: string): string {
  if (stage === 'setup') {
    return appRoutes.projects.setup(projectId);
  }
  return getCanonicalProjectRoute(stage, projectId);
}

export function getProjectStageFromPath(pathname: string): ProjectPipelineStage | null {
  const path = pathname.split('#')[0]?.split('?')[0] ?? pathname;
  if (path === appRoutes.projectSetup || path.startsWith(`${appRoutes.projectSetup}/`)) {
    return 'setup';
  }
  return getProjectViewFromPath(path);
}

export function getProjectStageCompletion(record: ProjectStageRecord): Record<ProjectPipelineStage, boolean | null> {
  return {
    setup: completionFromFlag(
      booleanFlag(record, 'setup_done'),
      hasValue(record, 'selected_storyline_id') || hasValue(record, 'concept_text') ? true : null
    ),
    studio: completionFromFlag(booleanFlag(record, 'has_graph')),
    timeline: completionFromFlag(booleanFlag(record, 'shots_done')),
    editor: completionFromFlag(
      booleanFlag(record, 'has_editor_timeline'),
      hasValue(record, 'qcut_project_json') ? true : null
    ),
    'directors-cut': completionFromFlag(booleanFlag(record, 'has_cut')),
  };
}

export function getProjectStageStatuses(
  record: ProjectStageRecord,
  currentStage: ProjectPipelineStage | null
): Record<ProjectPipelineStage, ProjectPipelineStageStatus> {
  const completion = getProjectStageCompletion(record);
  return PROJECT_PIPELINE_STAGES.reduce((acc, stage) => {
    if (stage.id === currentStage) {
      acc[stage.id] = 'current';
    } else if (completion[stage.id] === true) {
      acc[stage.id] = 'complete';
    } else if (completion[stage.id] === false) {
      acc[stage.id] = 'incomplete';
    } else {
      acc[stage.id] = 'unknown';
    }
    return acc;
  }, {} as Record<ProjectPipelineStage, ProjectPipelineStageStatus>);
}
