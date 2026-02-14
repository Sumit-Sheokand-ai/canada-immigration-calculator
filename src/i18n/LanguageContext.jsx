import { createContext, useContext, useState, useCallback } from 'react';
import en from './en.json';
import fr from './fr.json';

const translations = { en, fr };
const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem('crs-lang') || 'en'; } catch { return 'en'; }
  });

  const setLang = useCallback((l) => {
    setLangState(l);
    try { localStorage.setItem('crs-lang', l); } catch { /* ignore storage errors */ }
  }, []);

  const t = useCallback((key) => {
    return translations[lang]?.[key] || translations.en[key] || key;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
