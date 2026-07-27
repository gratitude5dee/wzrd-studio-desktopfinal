
import { type ProjectData } from './types';
import { Button } from '@/components/ui/button';
import { Plus, X, Info, Edit, Trash2, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { SceneEditDialog, type Scene } from './SceneEditDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useProjectContext } from './ProjectContext';
import { supabase } from '@/integrations/supabase/client';
import { supabaseService } from '@/services/supabaseService';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useVoiceSelection } from '@/voice/VoiceSelectionContext';
import { cn } from '@/lib/utils';
import { musicPolishAssets } from '@/lib/musicPolishAssets';

interface BreakdownTabProps {
  projectData: ProjectData;
  updateProjectData: (data: Partial<ProjectData>) => void;
}

// Staggered fade-up animation variants for scene cards
const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      delay: index * 0.1,
      ease: [0.25, 0.1, 0.25, 1.0],
    },
  }),
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: 0.2 },
  },
};

const getSceneFallback = (scene: Scene) => {
  const text = `${scene.location} ${scene.lighting} ${scene.weather} ${scene.description}`.toLowerCase();
  if (text.includes('roof') || text.includes('aerial') || text.includes('choreo')) return musicPolishAssets.landing.rooftopChoreography;
  if (text.includes('rain') || text.includes('storm')) return musicPolishAssets.cinema.neonStreet;
  if (text.includes('stage') || text.includes('studio') || text.includes('performance')) return musicPolishAssets.cinema.soundstage;
  if (text.includes('lyric') || text.includes('title')) return musicPolishAssets.lyrics.rnbGlass;
  if (text.includes('neon') || text.includes('night')) return musicPolishAssets.cinema.neonStreet;
  return musicPolishAssets.cinema.castBoard;
};

/** Scene card extracted to module scope to prevent remounts on parent re-renders. */
const SceneCard = ({
  scene,
  index,
  onEdit,
  onDelete,
  isVoiceSelected,
  onSelect,
}: {
  scene: Scene;
  index: number;
  onEdit: (scene: Scene) => void;
  onDelete: (sceneId: string) => void;
  isVoiceSelected?: boolean;
  onSelect?: (scene: Scene) => void;
}) => (
  <motion.div
    layout
    key={scene.id}
    custom={index}
    variants={cardVariants}
    initial="hidden"
    animate="visible"
    exit="exit"
    data-voice-scene-id={scene.id}
    onClick={() => onSelect?.(scene)}
    className={cn(
      'overflow-hidden bg-[#111319] rounded-lg border border-zinc-800 mb-4 transition-all duration-300',
      onSelect && 'cursor-pointer',
      isVoiceSelected &&
        'border-[#f97316]/70 ring-2 ring-[#f97316]/45 shadow-[0_0_0_4px_rgba(249,115,22,0.1),0_0_34px_rgba(249,115,22,0.22)]',
    )}
  >
    <div className="relative aspect-[16/5] overflow-hidden border-b border-white/5">
      <img
        src={getSceneFallback(scene).src}
        alt={getSceneFallback(scene).alt}
        className="h-full w-full object-cover opacity-65"
        loading="lazy"
        decoding="async"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/35 to-transparent" />
      <div className="absolute bottom-3 left-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#f97316]">
        Scene {scene.number}
      </div>
    </div>
    <div className="p-4">
    <div className="flex justify-between items-start mb-3">
      <h3 className="text-lg font-bold">{scene.title}</h3>
      <div className="flex space-x-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-zinc-400 hover:text-white hover:bg-zinc-800"
          onClick={() => onEdit(scene)}
          aria-label={`Edit ${scene.title}`}
        >
          <Edit className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-zinc-400 hover:text-red-500 hover:bg-zinc-800"
          onClick={() => onDelete(scene.id)}
          aria-label={`Delete ${scene.title}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>

    {scene.description && (
      <div className="text-sm text-zinc-400 mb-2 line-clamp-3">
        {scene.description}
      </div>
    )}

    <div className="grid grid-cols-3 gap-2 text-xs mt-4">
      {scene.location && (
        <div className="text-zinc-500">
          <span className="block font-medium uppercase mb-1">Location</span>
          <span className="text-zinc-300">{scene.location}</span>
        </div>
      )}
      {scene.lighting && (
        <div className="text-zinc-500">
          <span className="block font-medium uppercase mb-1">Lighting</span>
          <span className="text-zinc-300">{scene.lighting}</span>
        </div>
      )}
      {scene.weather && (
        <div className="text-zinc-500">
          <span className="block font-medium uppercase mb-1">Weather</span>
          <span className="text-zinc-300">{scene.weather}</span>
        </div>
      )}
    </div>
    </div>
  </motion.div>
);

const BreakdownTab = ({ projectData, updateProjectData }: BreakdownTabProps) => {
  const [fetchedScenes, setFetchedScenes] = useState<Scene[]>([]);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [showNoScenesAlert, setShowNoScenesAlert] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const { projectId, isGenerating } = useProjectContext();
  const { isSelected, selectTarget } = useVoiceSelection();

  // Function to fetch scenes
  const fetchScenes = async () => {
    if (!projectId) {
      setIsLoading(false);
      setFetchedScenes([]);
      setShowNoScenesAlert(true);
      return;
    }
    
    setIsLoading(true);
    try {
      console.log(`Fetching scenes for project ID: ${projectId}`);
      const scenes = await supabaseService.scenes.listByProject(projectId);
      
      console.log('Fetched scenes data:', scenes);

      if (scenes && scenes.length > 0) {
        // Transform the data to match our Scene type
        const mappedScenes: Scene[] = scenes.map(scene => ({
          id: scene.id,
          number: scene.scene_number,
          title: scene.title || `Scene ${scene.scene_number}`,
          description: scene.description || "",
          location: scene.location || "",
          lighting: scene.lighting || "",
          weather: scene.weather || "",
          voiceover: scene.voiceover || ""
        }));
        setFetchedScenes(mappedScenes);
        setShowNoScenesAlert(false);
      } else {
        setFetchedScenes([]);
        setShowNoScenesAlert(true);
      }
    } catch (error) {
      console.error('Error fetching scenes:', error);
      toast.error('Failed to load scenes');
      setFetchedScenes([]);
      setShowNoScenesAlert(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch scenes when projectId changes
  useEffect(() => {
    fetchScenes();
  }, [projectId]);

  const handleNewScene = async () => {
    if (!projectId) {
      toast.error("Please save the project first");
      return;
    }

    const newSceneNumber = fetchedScenes.length > 0 
      ? Math.max(...fetchedScenes.map(s => s.number)) + 1 
      : 1;
    
    try {
      // Insert new scene into database
      const sceneId = await supabaseService.scenes.create({
        project_id: projectId,
        scene_number: newSceneNumber,
        title: `Scene ${newSceneNumber}`
      });
      
      const newScene: Scene = {
        id: sceneId,
        number: newSceneNumber,
        title: `Scene ${newSceneNumber}`,
        description: "",
        location: "",
        lighting: "",
        weather: "",
        voiceover: ""
      };
      
      setFetchedScenes([...fetchedScenes, newScene]);
      setEditingScene(newScene);
      setShowNoScenesAlert(false);
      
    } catch (error) {
      console.error('Error creating scene:', error);
      toast.error('Failed to create new scene');
    }
  };

  const handleEditScene = (scene: Scene) => {
    setEditingScene(scene);
  };

  const handleDeleteScene = async (sceneId: string) => {
    if (!confirm('Are you sure you want to delete this scene?')) return;
    
    try {
      await supabaseService.scenes.delete(sceneId);
      
      setFetchedScenes(fetchedScenes.filter(s => s.id !== sceneId));
      toast.success('Scene deleted');
      
      if (fetchedScenes.length === 1) {
        setShowNoScenesAlert(true);
      }
    } catch (error) {
      console.error('Error deleting scene:', error);
      toast.error('Failed to delete scene');
    }
  };

  const handleSaveScene = async (updatedScene: Scene) => {
    try {
      // Update scene in database
      await supabaseService.scenes.update(updatedScene.id, {
        title: updatedScene.title,
        description: updatedScene.description,
        location: updatedScene.location,
        lighting: updatedScene.lighting,
        weather: updatedScene.weather,
        voiceover: updatedScene.voiceover
      });
      
      // Update local state
      setFetchedScenes(fetchedScenes.map(s => s.id === updatedScene.id ? updatedScene : s));
      setEditingScene(null);
      toast.success('Scene updated');
      
    } catch (error) {
      console.error('Error updating scene:', error);
      toast.error('Failed to update scene');
    }
  };

  const handleDismissAlert = () => {
    setShowNoScenesAlert(false);
  };

  return (
    <div className="min-h-full p-6">
      <h1 className="text-2xl font-bold mb-8">Breakdown</h1>
      
      {/* Show Generating state without blocking existing scene editing */}
      {isGenerating && (
        <Alert className="mb-6 border-zinc-800 bg-zinc-950/80 text-white">
          <div className="flex items-start">
            <Loader2 className="mr-2 mt-0.5 h-5 w-5 flex-shrink-0 animate-spin text-blue-400" />
            <AlertDescription className="text-zinc-300">
              Generating storyline and scenes. Existing breakdown items remain editable while new results arrive.
            </AlertDescription>
          </div>
        </Alert>
      )}
      
      {/* Show Loading state (after generation, before data arrives) */}
      {isLoading && (
        <div className="flex justify-center items-center min-h-[200px]">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
        </div>
      )}
      
      {/* Show Content or Empty/Alert state */}
      {!isLoading && (
        <>
          {showNoScenesAlert && fetchedScenes.length === 0 && (
            <Alert className="mb-6 bg-[#080D20] border-none text-white">
              <div className="flex items-start">
                <Info className="h-5 w-5 mr-2 text-blue-400 mt-0.5 flex-shrink-0" />
                <AlertDescription className="text-zinc-300">
                  {projectId
                    ? "No scenes generated or added yet. Scenes from your selected storyline will appear here. You can also add scenes manually."
                    : "Enter a concept and generate a storyline first. Scenes will appear here after generation."}
                </AlertDescription>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="absolute right-2 top-2 h-6 w-6 p-0 rounded-full" 
                onClick={handleDismissAlert}
                aria-label="Dismiss alert"
              >
                <X className="h-4 w-4" />
              </Button>
            </Alert>
          )}
          
          {fetchedScenes.length === 0 ? (
            projectId && (
              <div className="flex justify-center items-center min-h-[400px] bg-[#111319] rounded-lg border border-zinc-800 border-dashed">
                <div 
                  onClick={handleNewScene}
                  className="flex flex-col items-center justify-center cursor-pointer text-zinc-500 hover:text-zinc-300 transition-colors p-10 text-center"
                >
                  <Plus className="h-10 w-10 mb-3" />
                  <p className="font-medium">Add your first scene manually</p>
                  <p className="text-sm">Or generate scenes from your storyline in the previous step.</p>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-6">
              <AnimatePresence mode="popLayout">
                {fetchedScenes.map((scene, index) => (
                  <SceneCard
                    key={scene.id}
                    scene={scene}
                    index={index}
                    onEdit={handleEditScene}
                    onDelete={handleDeleteScene}
                    isVoiceSelected={isSelected('scene', scene.id) || isSelected('location', scene.id)}
                    onSelect={(selectedScene) =>
                      selectTarget({
                        type: 'scene',
                        id: selectedScene.id,
                        label: selectedScene.title,
                        projectId,
                        sceneNumber: selectedScene.number,
                      })
                    }
                  />
                ))}
              </AnimatePresence>
              <motion.div 
                className="mt-6 flex justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: fetchedScenes.length * 0.1 + 0.3 }}
              >
                <Button 
                  onClick={handleNewScene}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Scene Manually
                </Button>
              </motion.div>
            </div>
          )}
        </>
      )}

      {editingScene && (
        <SceneEditDialog
          scene={editingScene}
          open={true}
          onOpenChange={(open) => !open && setEditingScene(null)}
          onSave={handleSaveScene}
        />
      )}
    </div>
  );
};

export default BreakdownTab;
