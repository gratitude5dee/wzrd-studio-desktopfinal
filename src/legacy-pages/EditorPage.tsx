import { useParams, Navigate, useSearchParams } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { appRoutes } from "@/lib/routes";

import { VideoEditorProvider } from "@/providers/VideoEditorProvider";
import VideoEditor from "@/components/editor/VideoEditor";

import { QCutEditor } from "@/qcut/QCutEditor";

const EditorPage = () => {
	const { projectId } = useParams<{ projectId?: string }>();
	const [searchParams] = useSearchParams();
	const legacy = searchParams.get("legacy") === "1";

	if (!projectId) {
		return <Navigate to={appRoutes.home} replace />;
	}

	return (
		<div className="flex flex-col h-screen bg-[#0A0D16]">
			<AppHeader />
			<div className="flex-1 bg-[#0F1117] overflow-hidden">
				{legacy ? (
					<VideoEditorProvider>
						<VideoEditor />
					</VideoEditorProvider>
				) : (
					<QCutEditor projectId={projectId} />
				)}
			</div>
		</div>
	);
};

export default EditorPage;
