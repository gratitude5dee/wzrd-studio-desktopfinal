
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import { useProjectContext } from './ProjectContext';
import { appRoutes } from '@/lib/routes';

const NavigationFooter = () => {
  const navigate = useNavigate();
  const { 
    activeTab, 
    getVisibleTabs, 
    saveProjectData, 
    setActiveTab, 
    isCreating,
    isGenerating,
    isFinalizing,
    generateStoryline,
    finalizeProjectSetup,
    projectData,
    projectId
  } = useProjectContext();

  const visibleTabs = getVisibleTabs();
  const currentTabIndex = visibleTabs.indexOf(activeTab);
  const isLastTab = currentTabIndex === visibleTabs.length - 1;
  const isFirstTab = currentTabIndex === 0;

  const handleNext = async () => {
    let nextTab = activeTab;
    let proceed = true;
    
    // Logic for saving and generating
    if (activeTab === 'concept') {
      const savedProjectId = await saveProjectData();
      if (!savedProjectId) {
        proceed = false;
      } else if (projectData.conceptOption === 'ai') {
        // Only generate if AI option is selected and project saved
        const generationSuccess = await generateStoryline(savedProjectId);
        if (!generationSuccess) {
          console.warn("Storyline generation failed, but proceeding to next tab.");
        }
      }
      
      // Proceed to next tab if saving was successful
      if (proceed && currentTabIndex < visibleTabs.length - 1) {
        nextTab = visibleTabs[currentTabIndex + 1];
      }
    } else if (isLastTab) {
      // If on the last tab, finalize and navigate once the background job starts.
      if (projectId) {
        const ready = await finalizeProjectSetup();
        if (ready) {
          navigate(appRoutes.projects.studio(projectId));
        }
      }
      return;
    } else {
      // For other tabs, save data and move to the next one
      await saveProjectData();
      if (currentTabIndex < visibleTabs.length - 1) {
        nextTab = visibleTabs[currentTabIndex + 1];
      }
    }

    // Update active tab if needed and if proceed flag is true
    if (proceed && nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  };

  const handleBack = () => {
    if (currentTabIndex > 0) {
      setActiveTab(visibleTabs[currentTabIndex - 1]);
    }
  };

  // Determine if any processing is happening
  const isProcessing = isCreating || isGenerating || isFinalizing;
  
  // Determine the button text based on various states
  const getNextButtonText = () => {
    if (isFinalizing) return "Preparing Timeline...";
    if (isGenerating) return "Generating...";
    if (isCreating) return "Saving...";
    if (isLastTab) return "Go to Studio";
    return "Next";
  };

  return (
    <motion.div 
      className="border-t border-[rgba(249,115,22,0.12)] p-3 md:p-4 flex justify-between items-center bg-[#0a0a0f] sticky bottom-0 z-20 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:pb-4 gap-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.2, duration: 0.3 }}
    >
      <Button
        onClick={handleBack}
        variant="outline"
        className={`text-white border-[rgba(249,115,22,0.15)] hover:bg-[rgba(249,115,22,0.06)] hover:border-[rgba(249,115,22,0.25)] hover:text-white flex items-center gap-2 transition-opacity duration-300 ${
          isFirstTab || isProcessing ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        disabled={isProcessing || isFirstTab}
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>
      
      <div className="flex-1 flex justify-center">
        <div className="flex space-x-2">
          {visibleTabs.map((tab, i) => (
            <motion.div 
              key={tab}
              className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                i === currentTabIndex 
                  ? 'bg-[#f97316] scale-125' 
                  : i < currentTabIndex
                    ? 'bg-[rgba(249,115,22,0.4)]'
                    : 'bg-zinc-700'
              }`}
              initial={false}
              animate={{ 
                scale: i === currentTabIndex ? 1.2 : 1,
              }}
              transition={{ duration: 0.3 }}
            />
          ))}
        </div>
      </div>
      
      <Button
        onClick={handleNext}
        disabled={isProcessing}
        className={`px-4 sm:px-8 min-h-[44px] flex items-center gap-2 transition-all duration-300 ${
          isLastTab 
            ? 'bg-[#ea580c] hover:bg-[#dc2626] text-white shadow-[0_0_20px_rgba(249,115,22,0.2)]' 
            : 'bg-[#f97316] hover:bg-[#ea580c] text-white shadow-[0_0_20px_rgba(249,115,22,0.15)]'
        } disabled:opacity-50`}
      >
        {getNextButtonText()}
        {isProcessing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : !isLastTab ? (
          <ArrowRight className="h-4 w-4" />
        ) : null}
      </Button>
    </motion.div>
  );
};

export default NavigationFooter;
