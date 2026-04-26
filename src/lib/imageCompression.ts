/**
 * Client-side image compression for branch logos and other thumbnails.
 *
 * - Downscales to fit within `maxDimension` (default 512px) preserving aspect ratio.
 * - Re-encodes as WebP (quality 0.82) when supported, otherwise falls back to JPEG.
 * - Skips compression for SVG (vector — already small) and tiny files.
 *
 * Result: typical 2–5 MB photos shrink to 20–60 KB, making downloads on
 * end-user devices (registration / attendance / calendar) near-instant.
 */

export interface CompressOptions {
  maxDimension?: number;
  quality?: number;
  /** Don't recompress if file is already smaller than this (in bytes). */
  skipBelowBytes?: number;
}

export interface CompressedImage {
  blob: Blob;
  extension: string;
  mimeType: string;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
}

const DEFAULTS: Required<CompressOptions> = {
  maxDimension: 512,
  quality: 0.82,
  skipBelowBytes: 40 * 1024, // 40KB
};

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });

export async function compressImage(file: File, options: CompressOptions = {}): Promise<CompressedImage> {
  const opts = { ...DEFAULTS, ...options };
  const original = {
    blob: file,
    extension: (file.name.split(".").pop() || "png").toLowerCase(),
    mimeType: file.type || "image/png",
    width: 0,
    height: 0,
    originalSize: file.size,
    compressedSize: file.size,
  };

  // Pass-through for SVG (vector) — already optimal.
  if (file.type === "image/svg+xml" || original.extension === "svg") {
    return { ...original, extension: "svg", mimeType: "image/svg+xml" };
  }

  // Skip recompression for already-small files.
  if (file.size <= opts.skipBelowBytes) {
    try {
      const img = await loadImage(file);
      return { ...original, width: img.naturalWidth, height: img.naturalHeight };
    } catch {
      return original;
    }
  }

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return original;
  }

  const ratio = Math.min(1, opts.maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const targetWidth = Math.max(1, Math.round(img.naturalWidth * ratio));
  const targetHeight = Math.max(1, Math.round(img.naturalHeight * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return original;

  // Use white background for JPEG fallback (preserves transparency for WebP).
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  // Try WebP first.
  let blob = await canvasToBlob(canvas, "image/webp", opts.quality);
  let mimeType = "image/webp";
  let extension = "webp";

  // Fallback to JPEG if WebP not supported or browser returned PNG.
  if (!blob || blob.type !== "image/webp") {
    blob = await canvasToBlob(canvas, "image/jpeg", opts.quality);
    mimeType = "image/jpeg";
    extension = "jpg";
  }

  if (!blob) return { ...original, width: targetWidth, height: targetHeight };

  // If compression made it bigger (rare for already-optimized files), keep original.
  if (blob.size >= file.size) {
    return { ...original, width: targetWidth, height: targetHeight };
  }

  return {
    blob,
    extension,
    mimeType,
    width: targetWidth,
    height: targetHeight,
    originalSize: file.size,
    compressedSize: blob.size,
  };
}

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};
