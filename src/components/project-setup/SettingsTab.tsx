// Settings tab for project configuration
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ProjectData, Character } from './types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus, ChevronRight, Loader2, X, Sparkles } from 'lucide-react';
import { useProjectContext } from './ProjectContext';
import CharacterCard from './CharacterCard';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { StyleReferenceUploader } from './StyleReferenceUploader';
import { VoiceOverSelector } from './VoiceOverSelector';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useVoiceSelection } from '@/voice/VoiceSelectionContext';
import { runCharacterImageGenerationQueue } from './characterGenerationQueue';
import {
  DEFAULT_STYLE_PACK_ID,
  FEATURED_STYLE_PACKS,
  STYLE_PACKS,
  type StylePackId,
  getStylePackById,
  resolveStyleReferenceUrl,
} from '@/constants/stylePacks';

interface SettingsTabProps {
  projectData: ProjectData;
  updateProjectData: (data: Partial<ProjectData>) => void;
}

type AspectRatioOption = '16:9' | '1:1' | '9:16';

const getBrowserOrigin = () =>
  typeof window === 'undefined' ? undefined : window.location.origin;

const SettingsTab = ({ projectData, updateProjectData }: SettingsTabProps) => {
  const {
    projectId,
    characters,
    isLoadingCharacters,
    addCharacter,
    deleteCharacter,
    generateCharacterImage,
    failCharacterImageGeneration,
  } = useProjectContext();
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatioOption>(
    (projectData.aspectRatio as AspectRatioOption) || '16:9'
  );
  const [selectedVideoStyle, setSelectedVideoStyle] = useState<StylePackId>(
    getStylePackById(projectData.videoStyle || DEFAULT_STYLE_PACK_ID).id
  );
  const [isAddingCharacter, setIsAddingCharacter] = useState(false);
  const [isGeneratingAllImages, setIsGeneratingAllImages] = useState(false);
  const [showAllStyles, setShowAllStyles] = useState(false);
  const { isSelected, selectTarget } = useVoiceSelection();
  const styleReferenceUrlForGeneration = useMemo(
    () =>
      resolveStyleReferenceUrl(
        {
          videoStyle: selectedVideoStyle,
          styleReferenceUrl: projectData.styleReferenceUrl,
          styleReferenceAssetId: projectData.styleReferenceAssetId,
        },
        getBrowserOrigin()
      ),
    [projectData.styleReferenceAssetId, projectData.styleReferenceUrl, selectedVideoStyle]
  );

  // Update projectData when settings change
  useEffect(() => {
    updateProjectData({
      aspectRatio: selectedAspectRatio,
      videoStyle: selectedVideoStyle
    });
  }, [selectedAspectRatio, selectedVideoStyle, updateProjectData]);

  const handleAspectRatioChange = (ratio: AspectRatioOption) => {
    setSelectedAspectRatio(ratio);
  };

  const handleVideoStyleChange = (style: StylePackId) => {
    setSelectedVideoStyle(style);
  };

  const handleStyleReferenceChange = (url: string | null, assetId: string | null) => {
    updateProjectData({
      styleReferenceUrl: url || undefined,
      styleReferenceAssetId: assetId || undefined,
    });
  };

  const handleClearVoiceover = () => {
    updateProjectData({
      addVoiceover: false,
      voiceoverId: undefined,
      voiceoverName: undefined,
      voiceoverPreviewUrl: undefined,
    });
  };

  const handleAddCharacter = async () => {
    setIsAddingCharacter(true);
    try {
      await addCharacter();
    } catch (error) {
      console.error("Error adding character:", error);
      toast.error("Failed to add character");
    } finally {
      setIsAddingCharacter(false);
    }
  };

  const handleDeleteCharacter = async (characterId: string) => {
    await deleteCharacter(characterId);
  };

  const handleGenerateCharacterImage = useCallback(
    (character: Character) => generateCharacterImage(character.id, styleReferenceUrlForGeneration),
    [generateCharacterImage, styleReferenceUrlForGeneration]
  );

  const handleCharacterGenerationTimeout = useCallback(
    (character: Character, message: string) => failCharacterImageGeneration(character.id, message),
    [failCharacterImageGeneration]
  );

  const handleGenerateAllCharacterImages = useCallback(async () => {
    const queuedCharacters = characters.filter(
      (character) => character.image_status !== 'generating' && (!character.image_url || character.image_status === 'failed')
    );

    if (queuedCharacters.length === 0) {
      toast.info('All character images are already ready');
      return;
    }

    setIsGeneratingAllImages(true);
    try {
      await runCharacterImageGenerationQueue(queuedCharacters, handleGenerateCharacterImage);
    } finally {
      setIsGeneratingAllImages(false);
    }
  }, [characters, handleGenerateCharacterImage]);

  return (
    <div className="min-h-full flex flex-col md:flex-row">
      {/* Settings Section */}
      <div className="w-full md:w-1/2 p-6 border-r border-zinc-800">
        <h2 className="text-2xl font-semibold mb-6">Settings</h2>
        
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="projectName" className="block text-sm font-medium text-gray-400 uppercase">
              PROJECT NAME<span className="text-red-500">*</span>
            </Label>
            <Input 
              id="projectName"
              value={projectData.title || ''} 
              onChange={e => updateProjectData({ title: e.target.value })}
              placeholder="Enter your project name"
              className="w-full bg-[#111319] border-zinc-700 rounded text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="block text-sm font-medium text-gray-400 uppercase">
              ASPECT RATIO
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {(['16:9', '1:1', '9:16'] as AspectRatioOption[]).map(ratio => (
                <button 
                  key={ratio}
                  onClick={() => handleAspectRatioChange(ratio)}
                  className={`flex flex-col items-center justify-center h-12 rounded border ${
                    selectedAspectRatio === ratio 
                      ? 'bg-blue-600 border-blue-500 text-white' 
                      : 'bg-[#18191E] border-zinc-700 text-gray-400'
                  }`}
                >
                  <div className={`border border-current rounded-sm mb-1 ${
                    ratio === '16:9' ? 'w-8 h-5' : ratio === '1:1' ? 'w-5 h-5' : 'w-4 h-7'
                  }`}></div>
                  <span className="text-xs">{ratio}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="block text-sm font-medium text-gray-400 uppercase">
                VIDEO STYLE
              </Label>
              <button 
                onClick={() => setShowAllStyles(true)}
                className="text-xs text-blue-400 flex items-center hover:text-blue-300 transition-colors"
              >
                View All <ChevronRight className="h-3 w-3 ml-1" />
              </button>
            </div>
            
            <div className="grid grid-cols-4 gap-3">
              {FEATURED_STYLE_PACKS.map(style => (
                  <button
                    key={style.id}
                    onClick={() => handleVideoStyleChange(style.id)}
                    aria-pressed={selectedVideoStyle === style.id}
                    className={`relative p-1 pb-6 aspect-square rounded border ${
                      selectedVideoStyle === style.id
                        ? 'border-purple-500 ring-1 ring-purple-500/30' 
                        : 'border-zinc-700'
                    }`}
                  >
                    <div className="w-full h-full bg-[#18191E] rounded-sm overflow-hidden flex items-center justify-center">
                      <img
                        src={style.thumbUrl}
                        alt={`${style.label} style reference`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className={`absolute bottom-1 left-0 right-0 text-center text-xs ${
                      selectedVideoStyle === style.id ? 'text-white' : 'text-gray-400'
                    }`}>{style.label}</span>
                  </button>
              ))}
            </div>
          </div>

          {/* Video Styles Popup */}
          <Dialog open={showAllStyles} onOpenChange={setShowAllStyles}>
            <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>All Video Styles</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
                {STYLE_PACKS.map(style => (
                  <button
                    key={style.id}
                    onClick={() => {
                      handleVideoStyleChange(style.id);
                      setShowAllStyles(false);
                    }}
                    className={`relative p-3 rounded-xl border text-left transition-all ${
                      selectedVideoStyle === style.id
                        ? 'border-purple-500 bg-purple-500/10 ring-1 ring-purple-500/30'
                        : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className="w-full h-20 bg-zinc-800 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                      <img
                        src={style.thumbUrl}
                        alt={`${style.label} style reference`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <p className="font-medium text-sm">{style.label}</p>
                    <p className="text-xs text-zinc-400 mt-1">{style.description}</p>
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          {projectId && (
            <StyleReferenceUploader
              projectId={projectId}
              styleReferenceUrl={projectData.styleReferenceUrl}
              onStyleReferenceChange={handleStyleReferenceChange}
            />
          )}

          <div className="space-y-3">
            <VoiceOverSelector
              selectedVoiceId={projectData.voiceoverId}
              selectedVoiceName={projectData.voiceoverName}
              onVoiceSelect={(voiceId, voiceName, previewUrl) =>
                updateProjectData({
                  addVoiceover: true,
                  voiceoverId: voiceId,
                  voiceoverName: voiceName,
                  voiceoverPreviewUrl: previewUrl,
                })
              }
            />
            {projectData.voiceoverId && (
              <Button variant="outline" size="sm" onClick={handleClearVoiceover}>
                Clear voice selection
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="cinematic-inspiration" className="block text-sm font-medium text-gray-400 uppercase">
              CINEMATIC INSPIRATION
            </Label>
            <Textarea 
              id="cinematic-inspiration"
              value={projectData.cinematicInspiration || ''}
              onChange={e => updateProjectData({ cinematicInspiration: e.target.value })}
              placeholder="E.g., 'Retro, gritty, eclectic, stylish, noir...'"
              className="bg-[#111319] border-zinc-700 text-white"
            />
          </div>
        </div>
      </div>
      
      {/* Cast Section */}
      <div className="w-full md:w-1/2 p-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">Cast</h2>
          {characters.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateAllCharacterImages}
              disabled={isGeneratingAllImages}
              className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
            >
              {isGeneratingAllImages ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              {isGeneratingAllImages ? 'Generating...' : 'Generate All'}
            </Button>
          )}
        </div>
        
        <div className="flex flex-wrap gap-4">
          {/* Loading State */}
          {isLoadingCharacters && (
            <div className="w-full flex justify-center items-center min-h-[200px]">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
            </div>
          )}

          {/* Character Cards */}
          {!isLoadingCharacters && characters.length > 0 && characters.map(char => (
            <CharacterCard
              key={char.id}
              character={char}
              onDelete={handleDeleteCharacter}
              styleReferenceUrl={styleReferenceUrlForGeneration}
              onGenerate={handleGenerateCharacterImage}
              onGenerationTimeout={handleCharacterGenerationTimeout}
              isVoiceSelected={isSelected('character', char.id)}
              onSelect={(character) =>
                selectTarget({
                  type: 'character',
                  id: character.id,
                  label: character.name,
                  projectId,
                  sourceImageUrl: character.image_url ?? null,
                })
              }
            />
          ))}

          {/* Add Character Button */}
          {!isLoadingCharacters && (
            <Card
              onClick={handleAddCharacter}
              className="bg-[#18191E] border border-dashed border-zinc-700 w-56 aspect-[3/4] flex flex-col items-center justify-center p-4 cursor-pointer hover:border-zinc-500 hover:bg-[#222733] transition-all"
            >
              <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
                {isAddingCharacter ? (
                  <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
                ) : (
                  <Plus className="h-6 w-6 text-gray-400" />
                )}
              </div>
              <p className="text-gray-400">Add character</p>
            </Card>
          )}

          {/* Empty state message */}
          {!isLoadingCharacters && characters.length === 0 && (
            <div className="w-full text-center py-10 text-zinc-500">
              No characters generated or added yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsTab;
