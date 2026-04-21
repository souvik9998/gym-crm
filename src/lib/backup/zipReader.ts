/**
 * Browser-side helper to peek inside a backup zip without uploading.
 * Reads metadata.json and per-table row counts for the preview panel.
 */
import JSZip from "jszip";

export interface BackupPreview {
  metadata: {
    version: string;
    app: string;
    exported_at: string;
    branch_id: string;
    branch_name: string;
    branch_slug?: string;
    tenant_id: string;
    record_counts?: Record<string, number>;
    file_count?: number;
  };
  recordCounts: Record<string, number>;
  fileCount: number;
  totalRows: number;
}

const SUPPORTED_VERSIONS = ["1.0"];

export async function readBackupPreview(file: File): Promise<BackupPreview> {
  if (!file.name.toLowerCase().endsWith(".zip")) {
    throw new Error("File must be a .zip backup");
  }
  const zip = await JSZip.loadAsync(file);
  const metaFile = zip.file("metadata.json");
  if (!metaFile) throw new Error("Invalid backup: metadata.json missing");
  const metadata = JSON.parse(await metaFile.async("string"));

  if (metadata.app !== "GymKloud") {
    throw new Error("Not a GymKloud backup");
  }

  const recordCounts: Record<string, number> = { ...(metadata.record_counts || {}) };
  let fileCount = metadata.file_count ?? 0;

  // If counts weren't in metadata, parse them from data/*.json
  if (Object.keys(recordCounts).length === 0) {
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const m = path.match(/^data\/(.+)\.json$/);
      if (m) {
        const json = await entry.async("string");
        try {
          const arr = JSON.parse(json);
          if (Array.isArray(arr)) recordCounts[m[1]] = arr.length;
        } catch { /* ignore */ }
      }
    }
  }
  if (!metadata.file_count) {
    fileCount = Object.keys(zip.files).filter((p) => p.startsWith("files/") && !zip.files[p].dir).length;
  }

  const totalRows = Object.values(recordCounts).reduce((a, b) => a + b, 0);

  return {
    metadata: {
      ...metadata,
      version: String(metadata.version),
    },
    recordCounts,
    fileCount,
    totalRows,
  };
}

export function isSupportedVersion(version: string): boolean {
  return SUPPORTED_VERSIONS.includes(version);
}
