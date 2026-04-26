import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { BranchLogo } from "@/components/admin/BranchLogo";
import { useBranch } from "@/contexts/BranchContext";
import { toast } from "@/components/ui/sonner";
import { compressImage, formatBytes } from "@/lib/imageCompression";
import { validateImageFile } from "@/lib/imageValidation";
import { invalidatePublicDataCache } from "@/api/publicData";
import {
  PhotoIcon,
  ArrowUpTrayIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
const MAX_INPUT_BYTES = 5 * 1024 * 1024; // 5 MB raw input cap
const MAX_DIMENSION = 8000; // 8000×8000 — safeguard against decompression bombs

// RFC 4122 UUID — must match the storage RLS check on the path's first segment.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function BrandLogoSettings() {
  const { currentBranch, refreshBranches } = useBranch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [savings, setSavings] = useState<{ original: number; compressed: number } | null>(null);

  // Sync preview when branch changes
  useEffect(() => {
    setPreviewUrl(currentBranch?.logo_url ?? null);
    setSavings(null);
  }, [currentBranch?.id, currentBranch?.logo_url]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file || !currentBranch) return;

    // Defense-in-depth: only allow uploads under a real branch UUID we own.
    // The storage RLS policy enforces the same constraint server-side.
    if (!UUID_RE.test(currentBranch.id)) {
      toast.error("Cannot upload", { description: "No valid branch selected." });
      return;
    }

    // Coarse type/size gate — exits early on obviously wrong inputs.
    if (file.type && !ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Unsupported file type", {
        description: "Please upload a PNG, JPG, WebP, or SVG image.",
      });
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      toast.error("Image too large", {
        description: `Maximum size is ${formatBytes(MAX_INPUT_BYTES)}.`,
      });
      return;
    }

    setIsUploading(true);
    try {
      // 1. Deep validation: magic-byte sniffing, dimension check, SVG safety scan.
      //    Rejects spoofed extensions, decompression bombs, and active SVG content.
      const verdict = await validateImageFile(file, {
        maxBytes: MAX_INPUT_BYTES,
        maxDimension: MAX_DIMENSION,
        allowedFormats: ["png", "jpeg", "webp", "svg"], // no GIF for brand logos
      });
      if (!verdict.ok) {
        toast.error("Invalid image", { description: verdict.message });
        return;
      }

      // 2. Compress raster images. SVG is passed through unchanged (already small + vector).
      const compressed = await compressImage(file, { maxDimension: 512, quality: 0.82 });

      // 3. Build a safe storage path: <branchId>/logo.<ext>. Both segments are
      //    constrained to known-safe values (UUID + whitelisted extension).
      const safeExt = ["webp", "png", "jpg", "jpeg", "svg"].includes(compressed.extension)
        ? compressed.extension
        : "webp";
      const path = `${currentBranch.id}/logo.${safeExt}`;

      const { error: uploadError } = await supabase.storage
        .from("branch-logos")
        .upload(path, compressed.blob, {
          upsert: true,
          contentType: compressed.mimeType,
          cacheControl: "31536000", // 1 year — cache busted via ?t= query param
        });
      if (uploadError) throw uploadError;

      // 4. Get a public URL with cache-busting query param.
      const { data: urlData } = supabase.storage.from("branch-logos").getPublicUrl(path);
      const newLogoUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // 5. Persist on the branch row (RLS already restricts which branches the
      //    caller can update).
      const { error: updateError } = await supabase
        .from("branches")
        .update({ logo_url: newLogoUrl })
        .eq("id", currentBranch.id);
      if (updateError) throw updateError;

      // 6. Refresh local + public caches so dashboard, sidebar, registration, etc. update.
      setPreviewUrl(newLogoUrl);
      setSavings({ original: compressed.originalSize, compressed: compressed.compressedSize });
      await Promise.all([refreshBranches(), invalidatePublicDataCache()]);

      toast.success("Brand logo updated", {
        description:
          compressed.originalSize > compressed.compressedSize
            ? `Optimized from ${formatBytes(compressed.originalSize)} to ${formatBytes(compressed.compressedSize)}.`
            : "Your new logo is now live across all branches and member-facing pages.",
      });
    } catch (err: any) {
      console.error("Brand logo upload failed:", err);
      const description =
        err?.message?.includes("row-level security") || err?.message?.includes("permission")
          ? "You don't have permission to upload a logo for this branch."
          : err?.message;
      toast.error("Failed to upload logo", { description });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!currentBranch) return;
    setIsRemoving(true);
    try {
      const { error } = await supabase
        .from("branches")
        .update({ logo_url: null })
        .eq("id", currentBranch.id);
      if (error) throw error;

      // Best-effort cleanup of stored files (ignore failures — row update is the source of truth).
      const { data: files } = await supabase.storage.from("branch-logos").list(currentBranch.id);
      if (files && files.length > 0) {
        await supabase.storage
          .from("branch-logos")
          .remove(files.map((f) => `${currentBranch.id}/${f.name}`));
      }

      setPreviewUrl(null);
      setSavings(null);
      await Promise.all([refreshBranches(), invalidatePublicDataCache()]);
      toast.success("Brand logo removed");
    } catch (err: any) {
      console.error("Brand logo remove failed:", err);
      toast.error("Failed to remove logo", { description: err?.message });
    } finally {
      setIsRemoving(false);
    }
  };

  const branchName = currentBranch?.name ?? "Branch";

  return (
    <Card className="border border-border/40 shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden">
      <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-primary/10 text-primary">
            <PhotoIcon className="w-4 h-4 lg:w-5 lg:h-5" />
          </div>
          <div>
            <CardTitle className="text-base lg:text-xl">Brand Logo</CardTitle>
            <CardDescription className="text-xs lg:text-sm">
              Shown on the dashboard, registration, attendance, calendar, and invoices for{" "}
              <span className="font-medium text-foreground">{branchName}</span>.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 lg:p-6 pt-0 lg:pt-0">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 p-4 rounded-xl bg-muted/20 border border-border/40">
          <div className="flex-shrink-0 self-center sm:self-auto">
            {previewUrl ? (
              <div className="relative">
                <img
                  src={previewUrl}
                  alt={`${branchName} logo preview`}
                  className="w-20 h-20 lg:w-24 lg:h-24 rounded-2xl object-cover shadow-sm border border-border/40 bg-background"
                />
              </div>
            ) : (
              <BranchLogo logoUrl={null} name={branchName} size="lg" className="w-20 h-20 lg:w-24 lg:h-24 rounded-2xl text-2xl" />
            )}
          </div>

          <div className="flex-1 space-y-2 min-w-0">
            <p className="text-sm font-medium">
              {previewUrl ? "Logo uploaded" : "No logo set — initials are shown instead"}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Recommended: square PNG, JPG, WebP, or SVG. Images are automatically downscaled to 512&times;512 and re-encoded to WebP to keep load times fast for your members.
            </p>
            {savings && savings.original > savings.compressed && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                Optimized: {formatBytes(savings.original)} → {formatBytes(savings.compressed)} (
                {Math.round(((savings.original - savings.compressed) / savings.original) * 100)}% smaller)
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isRemoving || !currentBranch}
                className="h-9 rounded-lg active:scale-[0.98] transition-all"
              >
                {isUploading ? (
                  <span className="flex items-center gap-2"><ButtonSpinner />Uploading...</span>
                ) : (
                  <span className="flex items-center gap-2">
                    <ArrowUpTrayIcon className="w-4 h-4" />
                    {previewUrl ? "Replace logo" : "Upload logo"}
                  </span>
                )}
              </Button>
              {previewUrl && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleRemove}
                  disabled={isUploading || isRemoving}
                  className="h-9 rounded-lg active:scale-[0.98] transition-all"
                >
                  {isRemoving ? (
                    <span className="flex items-center gap-2"><ButtonSpinner />Removing...</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <TrashIcon className="w-4 h-4" />
                      Remove
                    </span>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default BrandLogoSettings;
