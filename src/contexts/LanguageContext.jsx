import React, { createContext, useContext, useState, useEffect } from 'react';
import en from '../i18n/en';
import my from '../i18n/my';

const LanguageContext = createContext();

const translations = { en, my };

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('ronda-lang') || 'en';
  });

  useEffect(() => {
    localStorage.setItem('ronda-lang', language);
  }, [language]);

  const t = (key) => {
    const langKeys = translations[language] || translations['en'];
    return langKeys[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
