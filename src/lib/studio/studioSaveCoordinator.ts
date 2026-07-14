type SaveOperation = () => Promise<void>;

interface ProjectSaveState {
  timer: ReturnType<typeof setTimeout> | null;
  requested: boolean;
  inFlight: Promise<void> | null;
  operation: SaveOperation;
}

const states = new Map<string, ProjectSaveState>();

function stateFor(projectId: string, operation: SaveOperation): ProjectSaveState {
  const existing = states.get(projectId);
  if (existing) {
    existing.operation = operation;
    return existing;
  }
  const created: ProjectSaveState = { timer: null, requested: false, inFlight: null, operation };
  states.set(projectId, created);
  return created;
}

export async function flushStudioSave(projectId: string, operation: SaveOperation): Promise<void> {
  const state = stateFor(projectId, operation);
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  if (state.inFlight) {
    await state.inFlight;
    if (state.requested) await flushStudioSave(projectId, state.operation);
    return;
  }
  if (!state.requested) return;
  state.requested = false;
  let failure: unknown;
  state.inFlight = state.operation().catch((error) => {
    failure = error;
  }).finally(() => {
    state.inFlight = null;
  });
  await state.inFlight;
  if (state.requested) await flushStudioSave(projectId, state.operation);
  if (failure) throw failure;
}

export function scheduleStudioSave(projectId: string, operation: SaveOperation, delayMs = 350): void {
  const state = stateFor(projectId, operation);
  state.requested = true;
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    state.timer = null;
    void flushStudioSave(projectId, state.operation).catch((error) => {
      console.error('[studioSaveCoordinator] save failed', error);
    });
  }, delayMs);
}

export function resetStudioSaveCoordinatorForTests(): void {
  for (const state of states.values()) if (state.timer) clearTimeout(state.timer);
  states.clear();
}
