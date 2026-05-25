import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import en, { type Translations } from "./en";
import zh from "./zh";

export type Language = "en" | "zh";

const LANG_KEY = "flowith_lang";

function loadLang(): Language {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "zh") return saved;
  } catch {}
  return "en";
}

function saveLang(lang: Language) {
  try { localStorage.setItem(LANG_KEY, lang); } catch {}
}

const dictionaries: Record<Language, Translations> = { en, zh };

interface LanguageContextValue {
  lang: Language;
  t: Translations;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>(loadLang);

  const setLanguage = useCallback((l: Language) => {
    setLang(l);
    saveLang(l);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLang((prev) => {
      const next: Language = prev === "en" ? "zh" : "en";
      saveLang(next);
      return next;
    });
  }, []);

  return (
    <LanguageContext.Provider value={{ lang, t: dictionaries[lang], setLanguage, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT(): Translations {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useT must be used within LanguageProvider");
  return ctx.t;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
