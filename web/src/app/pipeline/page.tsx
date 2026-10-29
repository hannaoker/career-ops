import { Suspense } from "react";
import { pipelineSummary } from "@/lib/career-ops";
import { PipelineView } from "@/components/pipeline-view";
import { loadPersonalDashboard } from "@/lib/personal-dashboard";
import { PersonalPipeline } from "@/components/personal/personal-pipeline";
import { formatPacific } from "@/components/personal/shared";

export const dynamic = "force-dynamic"; // always read fresh local files

export default function PipelinePage() {
  const personal = loadPersonalDashboard();
  if (personal) return <PersonalPipeline leads={personal.leads} refreshedLabel={formatPacific(personal.generatedAt)} />;
  const { inbox, applications } = pipelineSummary();
  return (
    <Suspense>
      <PipelineView applications={applications} inbox={inbox} />
    </Suspense>
  );
}
