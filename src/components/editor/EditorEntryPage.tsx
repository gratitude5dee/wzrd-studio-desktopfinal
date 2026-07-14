import { useEffect, useMemo, useState } from 'react';
import { FolderOpen, Loader2, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { appRoutes } from '@/lib/routes';
import { supabaseService, type Project } from '@/services/supabaseService';

const MAX_RECENT_PROJECTS = 12;

function projectTimestamp(project: Project): number {
  const value = project.updated_at ?? project.created_at;
  return value ? Date.parse(value) || 0 : 0;
}

export function selectRecentEditorProjects(projects: Project[]): Project[] {
  return [...projects]
    .sort((left, right) => projectTimestamp(right) - projectTimestamp(left))
    .slice(0, MAX_RECENT_PROJECTS);
}

export default function EditorEntryPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void supabaseService.projects.list().then((items) => {
      if (cancelled) return;
      setProjects(selectRecentEditorProjects(items));
      setIsLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setError('Unable to load projects right now.');
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }),
    [],
  );

  const openProject = (projectId: string) => {
    navigate(appRoutes.projects.editor(projectId));
  };

  const createProject = async () => {
    if (isCreating) return;
    setIsCreating(true);
    setError(null);

    try {
      const projectId = await supabaseService.projects.create({
        title: 'Untitled Project',
      });
      openProject(projectId);
    } catch {
      setError('Unable to create a project right now.');
      setIsCreating(false);
    }
  };

  return (
    <main
      className="min-h-screen bg-[#0A0D16] px-6 py-10 text-white"
      data-testid="editor-entry"
    >
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-5 border-b border-white/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-cyan-300/80">
              QCut
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Video editor</h1>
            <p className="mt-2 max-w-xl text-sm text-white/60">
              Open a recent project or create a new project before entering the isolated editor workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void createProject()}
            disabled={isCreating}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCreating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {isCreating ? 'Creating…' : 'New project'}
          </button>
        </div>

        <section className="pt-8" aria-labelledby="recent-projects-heading">
          <h2 id="recent-projects-heading" className="text-sm font-medium text-white/80">
            Recent projects
          </h2>

          {error && (
            <p className="mt-4 rounded-md border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100" role="alert">
              {error}
            </p>
          )}

          {isLoading ? (
            <div className="flex items-center gap-2 py-12 text-sm text-white/60">
              <Loader2 className="size-4 animate-spin" /> Loading projects…
            </div>
          ) : projects.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-6 py-12 text-center">
              <FolderOpen className="mx-auto size-8 text-white/35" />
              <p className="mt-3 text-sm font-medium">No projects yet</p>
              <p className="mt-1 text-sm text-white/50">Create one to start editing in QCut.</p>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => {
                const timestamp = project.updated_at ?? project.created_at;
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => openProject(project.id)}
                    className="group rounded-lg border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-cyan-300/50 hover:bg-white/[0.07]"
                    aria-label={`Open ${project.title}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{project.title}</p>
                        <p className="mt-1 text-xs text-white/45">
                          {timestamp ? `Updated ${dateFormatter.format(new Date(timestamp))}` : 'Ready to edit'}
                        </p>
                      </div>
                      <FolderOpen className="size-4 shrink-0 text-white/35 transition group-hover:text-cyan-300" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
