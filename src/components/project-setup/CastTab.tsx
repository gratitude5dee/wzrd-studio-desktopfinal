import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Plus, Sparkles, Loader2, Shirt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import CharacterCard from './CharacterCard';
import type { Character } from './types';
import { runCharacterImageGenerationQueue } from './characterGenerationQueue';

interface SceneAppearance {
  sceneId: string;
  sceneName: string;
  clothing?: string;
  accessories?: string;
  hairStyle?: string;
  notes?: string;
}

interface CastTabProps {
  characters: Character[];
  scenes: { id: string; title?: string; scene_number: number }[];
  styleReferenceUrl?: string;
  onAddCharacter: (name: string, description: string) => void;
  onDeleteCharacter: (id: string) => void;
  onGenerateAllImages?: () => Promise<void> | void;
  onGenerateCharacterImage?: (character: Character) => Promise<boolean | void> | boolean | void;
  onCharacterGenerationTimeout?: (character: Character, message: string) => Promise<void> | void;
}

export function CastTab({
  characters,
  scenes,
  styleReferenceUrl,
  onAddCharacter,
  onDeleteCharacter,
  onGenerateAllImages,
  onGenerateCharacterImage,
  onCharacterGenerationTimeout,
}: CastTabProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [wardrobeCharId, setWardrobeCharId] = useState<string | null>(null);
  const [appearances, setAppearances] = useState<Record<string, SceneAppearance[]>>({});
  const [isGeneratingAllImages, setIsGeneratingAllImages] = useState(false);

  const handleAdd = useCallback(() => {
    if (!newName.trim()) return;
    onAddCharacter(newName.trim(), newDescription.trim());
    setNewName('');
    setNewDescription('');
    setShowAddDialog(false);
  }, [newName, newDescription, onAddCharacter]);

  const wardrobeChar = characters.find((c) => c.id === wardrobeCharId);
  const charAppearances = wardrobeCharId ? (appearances[wardrobeCharId] ?? []) : [];
  const charactersNeedingImages = useMemo(
    () =>
      characters.filter(
        (character) => character.image_status !== 'generating' && (!character.image_url || character.image_status === 'failed')
      ),
    [characters]
  );

  const handleGenerateAllImages = useCallback(async () => {
    if (onGenerateAllImages) {
      await onGenerateAllImages();
      return;
    }

    if (!onGenerateCharacterImage || charactersNeedingImages.length === 0) return;

    setIsGeneratingAllImages(true);
    try {
      await runCharacterImageGenerationQueue(charactersNeedingImages, onGenerateCharacterImage);
    } finally {
      setIsGeneratingAllImages(false);
    }
  }, [charactersNeedingImages, onGenerateAllImages, onGenerateCharacterImage]);

  const handleUpdateAppearance = useCallback(
    (sceneId: string, field: keyof SceneAppearance, value: string) => {
      if (!wardrobeCharId) return;
      setAppearances((prev) => {
        const existing = prev[wardrobeCharId] ?? [];
        const idx = existing.findIndex((a) => a.sceneId === sceneId);
        if (idx >= 0) {
          const updated = [...existing];
          updated[idx] = { ...updated[idx], [field]: value };
          return { ...prev, [wardrobeCharId]: updated };
        }
        const scene = scenes.find((s) => s.id === sceneId);
        return {
          ...prev,
          [wardrobeCharId]: [
            ...existing,
            {
              sceneId,
              sceneName: scene?.title ?? `Scene ${scene?.scene_number ?? '?'}`,
              [field]: value,
            },
          ],
        };
      });
    },
    [wardrobeCharId, scenes],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Cast & Characters</h2>
            <p className="text-sm text-zinc-500">{characters.length} character{characters.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {characters.length > 0 && (onGenerateAllImages || onGenerateCharacterImage) && (
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              onClick={handleGenerateAllImages}
              disabled={isGeneratingAllImages || (!onGenerateAllImages && charactersNeedingImages.length === 0)}
            >
              {isGeneratingAllImages ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              {isGeneratingAllImages ? 'Generating...' : 'Generate All'}
            </Button>
          )}
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Character
          </Button>
        </div>
      </div>

      {/* Character grid */}
      {characters.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700/50 p-12 text-center">
          <Users className="mx-auto h-10 w-10 text-zinc-700" />
          <p className="mt-3 text-sm font-medium text-zinc-400">No characters yet</p>
          <p className="mt-1 text-xs text-zinc-600">
            Add characters manually or generate them from your storyline
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-4">
          <AnimatePresence>
            {characters.map((char) => (
              <motion.div key={char.id} layout>
                <div className="group relative">
                  <CharacterCard
                    character={char}
                    onDelete={onDeleteCharacter}
                    styleReferenceUrl={styleReferenceUrl}
                    onGenerate={onGenerateCharacterImage}
                    onGenerationTimeout={onCharacterGenerationTimeout}
                  />
                  {/* Wardrobe button */}
                  <button
                    type="button"
                    onClick={() => setWardrobeCharId(char.id)}
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary"
                  >
                    <Shirt className="h-3 w-3" />
                    Wardrobe
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add Character Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="border-zinc-700 bg-[#111319]">
          <DialogHeader>
            <DialogTitle className="text-white">New Character</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-zinc-400">Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Character name"
                className="mt-1 border-zinc-700 bg-zinc-900"
              />
            </div>
            <div>
              <Label className="text-zinc-400">Description</Label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Physical appearance, personality, role in the story..."
                className="mt-1 min-h-[100px] border-zinc-700 bg-zinc-900"
              />
            </div>
            <Button onClick={handleAdd} disabled={!newName.trim()} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Add Character
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Wardrobe / Scene Appearances Dialog */}
      <Dialog open={!!wardrobeCharId} onOpenChange={(open) => !open && setWardrobeCharId(null)}>
        <DialogContent className="max-w-2xl border-zinc-700 bg-[#111319]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Shirt className="h-5 w-5 text-primary" />
              {wardrobeChar?.name ?? 'Character'} — Wardrobe & Appearances
            </DialogTitle>
          </DialogHeader>

          {scenes.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">
              No scenes available. Generate your storyline first.
            </p>
          ) : (
            <div className="max-h-[400px] space-y-4 overflow-y-auto pr-1 pt-2">
              {scenes.map((scene) => {
                const appearance = charAppearances.find((a) => a.sceneId === scene.id);
                return (
                  <div
                    key={scene.id}
                    className="rounded-xl border border-zinc-700/50 bg-zinc-900/50 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                        Scene {scene.scene_number}
                      </Badge>
                      <span className="text-xs text-zinc-500">{scene.title ?? ''}</span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-[11px] text-zinc-500">Clothing</Label>
                        <Input
                          value={appearance?.clothing ?? ''}
                          onChange={(e) => handleUpdateAppearance(scene.id, 'clothing', e.target.value)}
                          placeholder="e.g., Red leather jacket, white tee"
                          className="mt-0.5 h-8 border-zinc-700 bg-zinc-800 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-zinc-500">Hair Style</Label>
                        <Input
                          value={appearance?.hairStyle ?? ''}
                          onChange={(e) => handleUpdateAppearance(scene.id, 'hairStyle', e.target.value)}
                          placeholder="e.g., Slicked back, ponytail"
                          className="mt-0.5 h-8 border-zinc-700 bg-zinc-800 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-zinc-500">Accessories</Label>
                        <Input
                          value={appearance?.accessories ?? ''}
                          onChange={(e) => handleUpdateAppearance(scene.id, 'accessories', e.target.value)}
                          placeholder="e.g., Sunglasses, gold chain"
                          className="mt-0.5 h-8 border-zinc-700 bg-zinc-800 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-zinc-500">Notes</Label>
                        <Input
                          value={appearance?.notes ?? ''}
                          onChange={(e) => handleUpdateAppearance(scene.id, 'notes', e.target.value)}
                          placeholder="e.g., Covered in rain, bloodied"
                          className="mt-0.5 h-8 border-zinc-700 bg-zinc-800 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
