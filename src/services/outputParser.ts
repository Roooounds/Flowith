/**
 * Output content parser — detects and extracts rich media from agent output.
 * Used by both the Output node canvas component and the properties panel.
 */

export interface MediaItem {
  type: "image" | "video" | "code" | "markdown" | "json" | "file" | "text";
  /** For image/video: the URL or data URI */
  src?: string;
  /** Alt text for images */
  alt?: string;
  /** For file links: filename */
  filename?: string;
  /** For code/markdown: language */
  language?: string;
  /** The text content (for text/code/markdown blocks) */
  content: string;
}

export interface ParsedOutput {
  /** Detected content type icon (emoji) */
  icon: string;
  /** Human-readable type label */
  kind: string;
  /** Extracted media items */
  items: MediaItem[];
}

// ── Detect single-line type ────────────────────────────────────────

function detectIcon(content: string): { icon: string; kind: string } {
  if (!content) return { icon: "📄", kind: "Text" };
  if (/^data:image\//.test(content)) return { icon: "🖼️", kind: "Image" };
  if (/^data:video\//.test(content) || /\.(mp4|mov|webm)/i.test(content)) return { icon: "🎬", kind: "Video" };
  if (/\.pptx?\b|PPT|PowerPoint/i.test(content)) return { icon: "📽️", kind: "PPT" };
  if (/\.xlsx?\b|Excel|spreadsheet/i.test(content)) return { icon: "📊", kind: "Excel" };
  if (/```\w+/.test(content)) return { icon: "💻", kind: "Code" };
  if (/^#+\s|\[.+\]\(|\.md\b/i.test(content)) return { icon: "📖", kind: "Markdown" };
  if (/^\s*[\{\[]/.test(content)) {
    try { JSON.parse(content); return { icon: "📋", kind: "JSON" }; } catch {}
  }
  return { icon: "📄", kind: "Text" };
}

// ── Image URL patterns ─────────────────────────────────────────────

const IMAGE_EXT = /\.(png|jpg|jpeg|gif|webp|svg|bmp)(\?.*)?$/i;
const MARKDOWN_IMAGE = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
const BARE_IMAGE_URL = /https?:\/\/[^\s]+\/[^\s]+\.(png|jpg|jpeg|gif|webp|svg|bmp)(\?[^\s)]*)?/gi;
const DATA_IMAGE = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;

const VIDEO_EXT = /\.(mp4|webm|mov|avi|mkv)(\?.*)?$/i;
const DATA_VIDEO = /data:video\/[^;]+;base64,[A-Za-z0-9+/=]+/g;
const BARE_VIDEO_URL = /https?:\/\/[^\s]+\/[^\s]+\.(mp4|webm|mov|avi|mkv)(\?[^\s)]*)?/gi;

const FILE_URL = /https?:\/\/[^\s]+\/[^\s]+\.(pdf|docx?|xlsx?|pptx?|zip|tar\.gz|csv|json|txt)(\?[^\s)]*)?/gi;

// ── Main parser ────────────────────────────────────────────────────

export function parseOutput(content: string | null | undefined): ParsedOutput {
  if (!content) {
    return { icon: "📄", kind: "Text", items: [{ type: "text", content: "(empty)" }] };
  }

  const items: MediaItem[] = [];
  let consumed = "";

  // 1. Data URI images
  for (const match of content.matchAll(new RegExp(DATA_IMAGE.source, "g"))) {
    items.push({ type: "image", src: match[0], alt: "Generated image", content: match[0] });
    consumed += match[0];
  }

  // 2. Data URI videos
  for (const match of content.matchAll(new RegExp(DATA_VIDEO.source, "g"))) {
    items.push({ type: "video", src: match[0], content: match[0] });
    consumed += match[0];
  }

  // 3. Markdown images
  for (const match of content.matchAll(MARKDOWN_IMAGE)) {
    items.push({ type: "image", src: match[2], alt: match[1] || "Image", content: match[0] });
    consumed += match[0];
  }

  // 4. Bare image URLs
  for (const match of content.matchAll(BARE_IMAGE_URL)) {
    const url = match[0];
    // Don't duplicate if already captured as markdown image
    if (!consumed.includes(url)) {
      items.push({ type: "image", src: url, alt: url.split("/").pop() || "Image", content: url });
      consumed += url;
    }
  }

  // 5. Bare video URLs
  for (const match of content.matchAll(BARE_VIDEO_URL)) {
    const url = match[0];
    if (!consumed.includes(url)) {
      items.push({ type: "video", src: url, content: url });
      consumed += url;
    }
  }

  // 6. File download links
  for (const match of content.matchAll(FILE_URL)) {
    const url = match[0];
    if (!consumed.includes(url)) {
      const fname = url.split("/").pop()?.split("?")[0] || "download";
      items.push({ type: "file", src: url, filename: fname, content: url });
      consumed += url;
    }
  }

  // 7. Code blocks (```lang ... ```)
  const codeBlockRe = /```(\w*)\n([\s\S]*?)```/g;
  for (const match of content.matchAll(codeBlockRe)) {
    items.push({
      type: "code",
      language: match[1] || undefined,
      content: match[2].trim(),
    });
    consumed += match[0];
  }

  // 8. Remaining text (non-media, non-code)
  // Strip out what we've already consumed, roughly
  let remaining = content;
  // Remove markdown image syntax
  remaining = remaining.replace(MARKDOWN_IMAGE, "");
  // Remove code blocks
  remaining = remaining.replace(codeBlockRe, "");
  // Remove data URIs
  remaining = remaining.replace(DATA_IMAGE, "").replace(DATA_VIDEO, "");
  // Remove bare media URLs
  remaining = remaining.replace(BARE_IMAGE_URL, "").replace(BARE_VIDEO_URL, "").replace(FILE_URL, "");

  const textContent = remaining.trim();
  if (textContent) {
    // Detect if remaining text is JSON
    let textType: MediaItem["type"] = "text";
    try {
      JSON.parse(textContent);
      textType = "json";
    } catch {}

    // Detect if it looks like markdown (has headers)
    if (/^#+\s/m.test(textContent)) {
      textType = "markdown";
    }

    items.push({ type: textType, content: textContent });
  }

  // If nothing was extracted, just return the raw content
  if (items.length === 0) {
    items.push({ type: "text", content: content });
  }

  const { icon, kind } = detectIcon(content);
  return { icon, kind, items };
}

/**
 * Quick check: does content contain any rich media?
 */
export function hasRichMedia(content: string | null | undefined): boolean {
  if (!content) return false;
  return (
    DATA_IMAGE.test(content) ||
    DATA_VIDEO.test(content) ||
    MARKDOWN_IMAGE.test(content) ||
    BARE_IMAGE_URL.test(content) ||
    BARE_VIDEO_URL.test(content) ||
    FILE_URL.test(content) ||
    /```\w+\n/.test(content)
  );
}
