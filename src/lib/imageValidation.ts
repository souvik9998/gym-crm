/**
 * Defense-in-depth image validation for user uploads.
 *
 * Browsers report `file.type` based on the OS / extension, which a malicious
 * user can forge. Before we trust any image we:
 *   1. Sniff the first bytes ("magic numbers") to confirm the real format.
 *   2. Reject anything that isn't an image we explicitly allow.
 *   3. For raster images, decode it to confirm it's a parseable image and to
 *      enforce sane dimension limits (prevents decompression bombs).
 *   4. For SVG, scan the text for active content (script tags, javascript:
 *      URIs, on* event handlers, foreignObject) — SVGs render in the browser
 *      and a malicious one can execute JS if served same-origin.
 *
 * All checks are async-friendly and run entirely in the browser before the
 * upload request is made.
 */

export type AllowedImageFormat = "png" | "jpeg" | "webp" | "gif" | "svg";

export interface ImageValidationOptions {
  maxBytes?: number;
  maxDimension?: number;
  allowedFormats?: AllowedImageFormat[];
}

export interface ImageValidationResult {
  ok: true;
  format: AllowedImageFormat;
  detectedMimeType: string;
  width?: number;
  height?: number;
}

export interface ImageValidationError {
  ok: false;
  reason:
    | "too_large"
    | "empty_file"
    | "unsupported_format"
    | "type_mismatch"
    | "decode_failed"
    | "dimensions_too_large"
    | "unsafe_svg";
  message: string;
}

const DEFAULTS: Required<ImageValidationOptions> = {
  maxBytes: 5 * 1024 * 1024, // 5 MB raw input cap
  maxDimension: 8000, // 8000×8000 max — guards against decompression bombs
  allowedFormats: ["png", "jpeg", "webp", "gif", "svg"],
};

/** Read the first N bytes for magic-number detection. */
const readHeader = async (file: File, bytes = 16): Promise<Uint8Array> => {
  const slice = file.slice(0, bytes);
  const buf = await slice.arrayBuffer();
  return new Uint8Array(buf);
};

/** Detect the true image format from magic bytes (independent of file.type). */
const sniffFormat = (bytes: Uint8Array): AllowedImageFormat | null => {
  if (bytes.length < 4) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  // GIF: 47 49 46 38 ('GIF8')
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "gif";
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
};

const looksLikeSvg = (text: string): boolean => {
  const trimmed = text.trimStart().toLowerCase();
  // Allow optional XML declaration / DOCTYPE before <svg
  return /<svg[\s>]/i.test(trimmed);
};

/**
 * SVGs render in the browser and can execute JS. Reject anything containing
 * <script>, javascript: URLs, on* event handlers, or <foreignObject>.
 *
 * This isn't a sanitizer — it's a strict allow/deny gate. If the file
 * contains any active content we refuse to upload it.
 */
const isSvgSafe = (text: string): boolean => {
  const lower = text.toLowerCase();
  if (lower.includes("<script")) return false;
  if (lower.includes("</script")) return false;
  if (lower.includes("<foreignobject")) return false;
  if (/javascript:\s*[^"'\s>]/i.test(lower)) return false;
  // on* event handlers (onclick=, onload=, etc.) inside any tag
  if (/\son[a-z]+\s*=\s*["']?[^"'\s>]+/i.test(text)) return false;
  // External entity / DTD shenanigans
  if (lower.includes("<!entity")) return false;
  return true;
};

const decodeRaster = (
  blob: Blob,
): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      URL.revokeObjectURL(url);
      if (w === 0 || h === 0) reject(new Error("decode_failed"));
      else resolve({ width: w, height: h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode_failed"));
    };
    img.src = url;
  });

export async function validateImageFile(
  file: File,
  options: ImageValidationOptions = {},
): Promise<ImageValidationResult | ImageValidationError> {
  const opts = { ...DEFAULTS, ...options };

  if (!file || file.size === 0) {
    return { ok: false, reason: "empty_file", message: "The selected file is empty." };
  }
  if (file.size > opts.maxBytes) {
    return {
      ok: false,
      reason: "too_large",
      message: `File is too large. Maximum allowed size is ${(opts.maxBytes / (1024 * 1024)).toFixed(1)} MB.`,
    };
  }

  const header = await readHeader(file, 16);
  const sniffed = sniffFormat(header);

  // SVG detection: text-based, sniff by reading content as text.
  let detectedFormat: AllowedImageFormat | null = sniffed;
  let svgText: string | null = null;
  if (!detectedFormat) {
    // Could be SVG (text). Read up to 64KB as text to inspect.
    const slice = file.slice(0, Math.min(file.size, 64 * 1024));
    svgText = await slice.text();
    if (looksLikeSvg(svgText)) {
      detectedFormat = "svg";
    }
  }

  if (!detectedFormat) {
    return {
      ok: false,
      reason: "unsupported_format",
      message: "This file isn't a recognized image. Please upload a PNG, JPG, WebP, GIF, or SVG.",
    };
  }

  if (!opts.allowedFormats.includes(detectedFormat)) {
    return {
      ok: false,
      reason: "unsupported_format",
      message: `${detectedFormat.toUpperCase()} files are not allowed here.`,
    };
  }

  // For browser-supplied MIME, ensure it doesn't disagree with our sniff.
  // We allow empty file.type (some OSes), but reject mismatches.
  const expectedMimeByFormat: Record<AllowedImageFormat, string[]> = {
    png: ["image/png"],
    jpeg: ["image/jpeg", "image/jpg"],
    webp: ["image/webp"],
    gif: ["image/gif"],
    svg: ["image/svg+xml", "text/xml", "application/xml", ""],
  };
  if (file.type && !expectedMimeByFormat[detectedFormat].includes(file.type)) {
    return {
      ok: false,
      reason: "type_mismatch",
      message: "The file's type doesn't match its actual contents.",
    };
  }

  if (detectedFormat === "svg") {
    // Read full text for safety scan (size already capped).
    const fullText = svgText && file.size <= 64 * 1024 ? svgText : await file.text();
    if (!isSvgSafe(fullText)) {
      return {
        ok: false,
        reason: "unsafe_svg",
        message: "This SVG contains active content (scripts or event handlers) and was blocked for safety.",
      };
    }
    return {
      ok: true,
      format: "svg",
      detectedMimeType: "image/svg+xml",
    };
  }

  // Raster: decode to confirm it's parseable + enforce dimension limits.
  try {
    const { width, height } = await decodeRaster(file);
    if (width > opts.maxDimension || height > opts.maxDimension) {
      return {
        ok: false,
        reason: "dimensions_too_large",
        message: `Image dimensions exceed ${opts.maxDimension}×${opts.maxDimension} pixels.`,
      };
    }
    const mime =
      detectedFormat === "jpeg"
        ? "image/jpeg"
        : detectedFormat === "png"
          ? "image/png"
          : detectedFormat === "webp"
            ? "image/webp"
            : "image/gif";
    return { ok: true, format: detectedFormat, detectedMimeType: mime, width, height };
  } catch {
    return {
      ok: false,
      reason: "decode_failed",
      message: "We couldn't read this image. It may be corrupted.",
    };
  }
}
