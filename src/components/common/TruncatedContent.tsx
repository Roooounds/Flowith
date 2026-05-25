import { useState } from "react";

const THRESHOLD = 300;

interface Props {
  content: string;
  /** Name used for the file link label */
  filename?: string;
  className?: string;
  /** Show monospace font (for code) */
  mono?: boolean;
}

export default function TruncatedContent({ content, filename, className = "", mono }: Props) {
  const [showFull, setShowFull] = useState(false);
  const exceeds = content.length > THRESHOLD;

  if (!exceeds) {
    return <p className={className}>{content}</p>;
  }

  const truncated = content.slice(0, THRESHOLD);
  const safeName = (filename || "content").replace(/[^a-zA-Z0-9一-鿿_-]/g, "_").slice(0, 30);

  return (
    <div>
      {showFull ? (
        <p className={`${className} ${mono ? "font-mono" : ""}`}>{content}</p>
      ) : (
        <p className={className}>
          {truncated}
          <span className="text-boss-text-muted/40">...</span>
        </p>
      )}

      {/* File link */}
      <button
        onClick={() => setShowFull(!showFull)}
        className="mt-1.5 flex items-center gap-1.5 text-[10px] text-boss-accent hover:text-boss-accent-hover transition-colors group/file"
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <span className="underline underline-offset-2 truncate max-w-[180px]">
          {safeName}.txt
        </span>
        <span className="text-boss-text-muted/50 text-[9px]">
          ({content.length.toLocaleString()} chars) — {showFull ? "collapse" : "expand"}
        </span>
      </button>
    </div>
  );
}
