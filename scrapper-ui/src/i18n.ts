import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import translationEN from './locales/en/translation.json';
import translationUK from './locales/uk/translation.json';

const resources = {
  en: {
    translation: translationEN,
  },
  uk: {
    translation: translationUK,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: ['en', 'uk'],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    cleanCode: true,
    fallbackLng: 'en',
    detection: {
      // Keep explicit user choice, otherwise fall back to English.
      order: ['localStorage', 'querystring', 'cookie'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
