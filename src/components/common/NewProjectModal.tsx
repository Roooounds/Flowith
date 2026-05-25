import { useState } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useT } from "@/i18n";
import { selectProjectFolder } from "@/services/fileStorage";

interface Props {
  onClose: () => void;
}

export default function NewProjectModal({ onClose }: Props) {
  const createProject = useProjectStore((s) => s.createProject);
  const [name, setName] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const t = useT();
  const [picking, setPicking] = useState(false);

  const handlePickFolder = async () => {
    setPicking(true);
    const folderName = await selectProjectFolder();
    if (folderName) setFolder(folderName);
    setPicking(false);
  };

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createProject(trimmed || t.newProject.untitled, "", folder ?? undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="panel w-full max-w-sm p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-boss-text mb-4">{t.newProject.title}</h3>

        <label className="block text-[10px] font-medium text-boss-text-muted mb-1">{t.newProject.nameLabel}</label>
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder={t.newProject.namePlaceholder}
          className="w-full px-3 py-2 bg-boss-bg border border-boss-border rounded-lg text-sm text-boss-text placeholder:text-boss-text-muted/40 focus:outline-none focus:border-boss-accent transition-colors mb-3"
          autoFocus
        />

        <label className="block text-[10px] font-medium text-boss-text-muted mb-1">{t.newProject.folderLabel}</label>
        <button
          onClick={handlePickFolder}
          disabled={picking}
          className="w-full px-3 py-2 bg-boss-bg border border-dashed border-boss-border hover:border-boss-accent/50 rounded-lg text-sm text-boss-text-muted hover:text-boss-text transition-colors mb-4 flex items-center gap-2 disabled:opacity-50"
        >
          <svg className="w-4 h-4 text-boss-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
          <span className="truncate text-xs">{folder || (picking ? t.newProject.selecting : t.newProject.selectFolder)}</span>
        </button>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-boss-border text-xs text-boss-text-muted hover:text-boss-text transition-colors">{t.newProject.cancel}</button>
          <button onClick={handleCreate} disabled={!name.trim()} className="flex-1 py-2 rounded-lg bg-boss-accent hover:bg-boss-accent-hover text-white text-xs font-medium transition-colors disabled:opacity-40">{t.newProject.create}</button>
        </div>
      </div>
    </div>
  );
}
