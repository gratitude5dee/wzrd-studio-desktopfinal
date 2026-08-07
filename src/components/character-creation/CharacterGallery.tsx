import React from 'react';
import { Heart, MoreHorizontal, Plus, Search, ShieldCheck, Trash2, User2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KanvasEmptyState } from '@/components/kanvas/primitives';
import { FinalizeAssetDialog } from '@/components/ip-vault/FinalizeAssetDialog';
import { useCharacterCreationStore } from '@/lib/stores/character-creation-store';
import { CHARACTER_PRESETS, stashPresetStarter, type CharacterPreset } from './characterPresets';
import type { CharacterBlueprint } from '@/types/character-creation';

// ---------------------------------------------------------------------------
// CharacterGallery — Grid of saved characters/objects with search
// ---------------------------------------------------------------------------

export function CharacterGallery() {
  const { blueprints, setMode, selectBlueprint, toggleFavorite, removeBlueprint } =
    useCharacterCreationStore();
  const [search, setSearch] = React.useState('');
  const [contextMenu, setContextMenu] = React.useState<string | null>(null);
  const [finalizeBlueprint, setFinalizeBlueprint] = React.useState<CharacterBlueprint | null>(null);

  const startFromPreset = React.useCallback((preset: CharacterPreset) => {
    const state = useCharacterCreationStore.getState();
    state.resetDraft();
    state.updateDraftTraits(preset.traits);
    state.updateDraftStyleDetails(preset.styleDetails);
    stashPresetStarter(preset);
    setMode('builder');
  }, [setMode]);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return blueprints;
    const q = search.toLowerCase();
    return blueprints.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.slug.includes(q) ||
        b.kind.includes(q),
    );
  }, [blueprints, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Character Library
          </p>
          <p className="mt-1 text-lg font-semibold text-white">
            {blueprints.length} character{blueprints.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            useCharacterCreationStore.getState().resetDraft();
            setMode('builder');
          }}
          className="flex items-center gap-2 rounded-2xl border border-orange-400/40 bg-orange-400/10 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-orange-400/20"
        >
          <Plus className="h-4 w-4 text-orange-400" />
          Create New
        </button>
      </div>

      {/* Preset starters */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">
          Start from a preset
        </p>
        <div className="flex flex-wrap gap-3">
          {CHARACTER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => startFromPreset(preset)}
              aria-label={`Start from preset ${preset.name}`}
              className="group w-24 overflow-hidden rounded-xl border border-white/10 text-left transition-all hover:border-orange-400/40"
            >
              <div className="aspect-square w-full bg-zinc-900">
                <img
                  src={preset.imageUrl}
                  alt={preset.alt}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              </div>
              <p className="truncate px-2 py-1.5 text-[10px] font-semibold text-zinc-300">{preset.name}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          placeholder="Search characters by name or @slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-zinc-500 focus:border-orange-400/40 focus:outline-none"
        />
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <KanvasEmptyState
          bare
          className="py-16"
          icon={<User2 className="h-12 w-12" />}
          title={
            blueprints.length === 0
              ? 'No characters yet. Create your first one!'
              : 'No characters match your search.'
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((bp) => (
            <CharacterCard
              key={bp.id}
              blueprint={bp}
              showContext={contextMenu === bp.id}
              onToggleContext={() =>
                setContextMenu(contextMenu === bp.id ? null : bp.id)
              }
              onSelect={() => selectBlueprint(bp.id)}
              onFavorite={() => toggleFavorite(bp.id)}
              onDelete={() => removeBlueprint(bp.id)}
              onFinalize={() => setFinalizeBlueprint(bp)}
            />
          ))}
        </div>
      )}
      <FinalizeAssetDialog
        open={Boolean(finalizeBlueprint)}
        onOpenChange={(open) => {
          if (!open) setFinalizeBlueprint(null);
        }}
        source={
          finalizeBlueprint
            ? {
                sourceType: 'character_blueprint',
                sourceId: finalizeBlueprint.id,
                title: finalizeBlueprint.name,
                description: finalizeBlueprint.promptFragment,
                assetKind: finalizeBlueprint.kind === 'environment' ? 'location' : finalizeBlueprint.kind,
                previewUrl: finalizeBlueprint.thumbnailUrl ?? finalizeBlueprint.imageUrl,
              }
            : null
        }
        onFinalized={() => setFinalizeBlueprint(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CharacterCard
// ---------------------------------------------------------------------------

function CharacterCard({
  blueprint,
  showContext,
  onToggleContext,
  onSelect,
  onFavorite,
  onDelete,
  onFinalize,
}: {
  blueprint: CharacterBlueprint;
  showContext: boolean;
  onToggleContext: () => void;
  onSelect: () => void;
  onFavorite: () => void;
  onDelete: () => void;
  onFinalize: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect();
      }}
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-all',
        'hover:border-white/20 hover:bg-white/[0.06] hover:shadow-[0_0_40px_rgba(249,115,22,0.04)]',
        'cursor-pointer',
      )}
    >
      {/* Image / Placeholder */}
      <div className="relative aspect-[3/4] w-full bg-zinc-900">
        {blueprint.imageUrl ? (
          <img
            src={blueprint.imageUrl}
            alt={blueprint.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <User2 className="h-16 w-16 text-zinc-700" />
          </div>
        )}

        {/* Overlay actions */}
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFinalize();
            }}
            className="rounded-lg bg-black/60 p-1.5 text-zinc-300 backdrop-blur-sm hover:text-orange-300"
            aria-label={`Finalize ${blueprint.name} into IP Vault`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFavorite();
            }}
            className="rounded-lg bg-black/60 p-1.5 text-zinc-300 backdrop-blur-sm hover:text-orange-400"
          >
            <Heart
              className={cn('h-3.5 w-3.5', blueprint.isFavorite && 'fill-orange-400 text-orange-400')}
            />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleContext();
            }}
            className="rounded-lg bg-black/60 p-1.5 text-zinc-300 backdrop-blur-sm hover:text-white"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Context menu */}
        {showContext && (
          <div className="absolute right-2 top-10 z-10 rounded-xl border border-white/10 bg-zinc-900/95 p-1 shadow-xl backdrop-blur-sm">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </div>
        )}

        {/* Kind badge */}
        <span className="absolute bottom-2 left-2 rounded-lg bg-black/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-300 backdrop-blur-sm">
          {blueprint.kind}
        </span>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="truncate text-sm font-semibold text-white">{blueprint.name}</p>
        <p className="mt-0.5 truncate text-xs text-zinc-500">@{blueprint.slug}</p>
      </div>
    </div>
  );
}
