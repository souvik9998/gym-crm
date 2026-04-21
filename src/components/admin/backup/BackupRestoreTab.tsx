import { ExportCard } from "./ExportCard";
import { ImportCard } from "./ImportCard";
import { useAuth } from "@/contexts/AuthContext";

export const BackupRestoreTab = () => {
  const { isGymOwner, isSuperAdmin } = useAuth();
  if (!isGymOwner && !isSuperAdmin) {
    return (
      <div className="rounded-lg border border-border/60 p-6 text-sm text-muted-foreground">
        Only gym owners can access backup &amp; restore.
      </div>
    );
  }
  return (
    <div className="space-y-4 lg:space-y-6">
      <ExportCard />
      <ImportCard />
    </div>
  );
};
