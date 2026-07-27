import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ProjectProvider } from './ProjectContext';
import ProjectSetupHeader from './ProjectSetupHeader';
import TabNavigation from './TabNavigation';
import TabContent from './TabContent';
import NavigationFooter from './NavigationFooter';
import { ProjectSetupVoiceBridge } from './ProjectSetupVoiceBridge';
import { getProjectSetupInitialProjectId } from './projectSetupHydration';

const ProjectSetupWizard = () => {
  const params = useParams<{ projectId?: string }>();
  const [searchParams] = useSearchParams();
  const searchString = searchParams.toString();
  const initialProjectId = useMemo(
    () => params.projectId || getProjectSetupInitialProjectId(`?${searchString}`),
    [params.projectId, searchString]
  );

  return (
    <ProjectProvider initialProjectId={initialProjectId}>
      <ProjectSetupVoiceBridge />
      <div className="min-h-screen flex flex-col bg-[#0A0A0F]">
        {/* Ambient background effects */}
        <div className="fixed inset-0 pointer-events-none hidden md:block">
          {/* Top-left warm glow */}
          <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-primary/[0.03] rounded-full blur-[120px]" />
          {/* Bottom-right accent glow */}
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-accent/[0.02] rounded-full blur-[100px]" />
        </div>
        
        {/* Header */}
        <ProjectSetupHeader />
        
        {/* Tab Navigation */}
        <TabNavigation />

        {/* Tab Content */}
        <TabContent />

        {/* Footer with navigation buttons */}
        <NavigationFooter />
      </div>
    </ProjectProvider>
  );
};

export default ProjectSetupWizard;
