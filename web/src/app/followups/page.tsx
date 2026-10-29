import { Suspense } from "react";
import { FollowupsView } from "@/components/followups/followups-view";
import { loadPersonalDashboard } from "@/lib/personal-dashboard";
import { PersonalFollowups } from "@/components/personal/personal-followups";

export const dynamic = "force-dynamic"; // cadence is computed fresh per request

export default function FollowupsPage() {
  const personal = loadPersonalDashboard();
  if (personal) return <PersonalFollowups dashboard={personal} />;
  return (
    <Suspense>
      <FollowupsView />
    </Suspense>
  );
}
