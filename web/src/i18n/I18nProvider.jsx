import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  CRM_LANGUAGE_STORAGE_KEY,
  DEFAULT_LANGUAGE,
  LANGUAGE_LABELS,
  LEGACY_HOME_LANGUAGE_STORAGE_KEY,
  LITERAL_TRANSLATIONS,
  MESSAGES,
  PATTERN_TRANSLATIONS,
  normalizeLanguage
} from "./translations.js";

const I18nContext = createContext(null);
const TRANSLATABLE_ATTRIBUTES = ["aria-label", "title", "placeholder", "aria-valuetext"];

function getInitialLanguage() {
  if (typeof window === "undefined") {
    return DEFAULT_LANGUAGE;
  }
  const stored = window.localStorage.getItem(CRM_LANGUAGE_STORAGE_KEY)
    || window.localStorage.getItem(LEGACY_HOME_LANGUAGE_STORAGE_KEY);
  if (stored) {
    return normalizeLanguage(stored);
  }
  return normalizeLanguage(window.navigator?.language);
}

function getByPath(source, path) {
  return String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce((acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined), source);
}

function interpolate(template, params = {}) {
  return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  ));
}

const literalEntryByText = (() => {
  const map = new Map();
  LITERAL_TRANSLATIONS.forEach((entry) => {
    ["en", "uz", "ru"].forEach((language) => {
      const value = String(entry?.[language] || "").trim();
      if (value && !map.has(value.toLowerCase())) {
        map.set(value.toLowerCase(), entry);
      }
    });
  });
  return map;
})();

function preserveOuterWhitespace(source, translated) {
  const raw = String(source ?? "");
  const prefix = raw.match(/^\s*/)?.[0] || "";
  const suffix = raw.match(/\s*$/)?.[0] || "";
  return `${prefix}${translated}${suffix}`;
}

function translatePattern(trimmed, language) {
  const translateToken = (token) => {
    const raw = String(token ?? "");
    const entry = literalEntryByText.get(raw.trim().toLowerCase());
    const translated = entry?.[normalizeLanguage(language)];
    return translated ? preserveOuterWhitespace(raw, translated) : raw;
  };

  for (const item of PATTERN_TRANSLATIONS) {
    const match = trimmed.match(item.pattern);
    if (!match) {
      continue;
    }
    const handler = item[language];
    if (typeof handler === "function") {
      return handler(...match, translateToken);
    }
  }
  return "";
}

export function translateLiteral(value, language = DEFAULT_LANGUAGE) {
  const raw = String(value ?? "");
  const trimmed = raw.trim();
  if (!trimmed) {
    return raw;
  }

  const numberedMatch = trimmed.match(/^(\d+\.\s+)(.+)$/);
  if (numberedMatch) {
    const translatedTail = translateLiteral(numberedMatch[2], language).trim();
    if (translatedTail && translatedTail !== numberedMatch[2]) {
      return preserveOuterWhitespace(raw, `${numberedMatch[1]}${translatedTail}`);
    }
  }

  const patternTranslation = translatePattern(trimmed, language);
  if (patternTranslation) {
    return preserveOuterWhitespace(raw, patternTranslation);
  }

  const entry = literalEntryByText.get(trimmed.toLowerCase());
  const translated = entry?.[normalizeLanguage(language)];
  return translated ? preserveOuterWhitespace(raw, translated) : raw;
}

function shouldSkipNode(node) {
  const parent = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  if (!parent || !(parent instanceof HTMLElement)) {
    return true;
  }
  return Boolean(parent.closest("script, style, code, pre, [data-i18n-skip]"));
}

function translateElementAttributes(element, language) {
  TRANSLATABLE_ATTRIBUTES.forEach((attributeName) => {
    if (!element.hasAttribute(attributeName)) {
      return;
    }
    const currentValue = element.getAttribute(attributeName);
    const nextValue = translateLiteral(currentValue, language);
    if (nextValue !== currentValue) {
      element.setAttribute(attributeName, nextValue);
    }
  });

  if (
    element instanceof HTMLInputElement
    && ["button", "submit", "reset"].includes(String(element.type || "").toLowerCase())
  ) {
    const nextValue = translateLiteral(element.value, language);
    if (nextValue !== element.value) {
      element.value = nextValue;
    }
  }
}

function translateTree(root, language) {
  if (typeof document === "undefined" || !root) {
    return;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let current = walker.currentNode;
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      if (!shouldSkipNode(current)) {
        const nextValue = translateLiteral(current.nodeValue, language);
        if (nextValue !== current.nodeValue) {
          current.nodeValue = nextValue;
        }
      }
    } else if (current.nodeType === Node.ELEMENT_NODE && !shouldSkipNode(current)) {
      translateElementAttributes(current, language);
    }
    current = walker.nextNode();
  }
}

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(getInitialLanguage);
  const translatingRef = useRef(false);
  const pendingFrameRef = useRef(0);

  const setLanguage = useCallback((nextLanguage) => {
    setLanguageState((current) => normalizeLanguage(
      typeof nextLanguage === "function" ? nextLanguage(current) : nextLanguage
    ));
  }, []);

  const t = useCallback((key, params = {}) => {
    const message = getByPath(MESSAGES[language], key) ?? getByPath(MESSAGES[DEFAULT_LANGUAGE], key) ?? key;
    return interpolate(message, params);
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    t,
    languageLabel: LANGUAGE_LABELS[language] || LANGUAGE_LABELS[DEFAULT_LANGUAGE],
    nextLanguage: language === "uz" ? "ru" : "uz",
    translate: (text) => translateLiteral(text, language)
  }), [language, setLanguage, t]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(CRM_LANGUAGE_STORAGE_KEY, language);
    window.localStorage.setItem(LEGACY_HOME_LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (typeof document === "undefined" || !document.body) {
      return undefined;
    }

    const runTranslation = (root = document.body) => {
      if (translatingRef.current) {
        return;
      }
      translatingRef.current = true;
      try {
        translateTree(root, language);
      } finally {
        translatingRef.current = false;
      }
    };

    const scheduleTranslation = (root = document.body) => {
      if (pendingFrameRef.current) {
        window.cancelAnimationFrame(pendingFrameRef.current);
      }
      pendingFrameRef.current = window.requestAnimationFrame(() => {
        pendingFrameRef.current = 0;
        runTranslation(root);
      });
    };

    runTranslation(document.body);
    const observer = new MutationObserver((mutations) => {
      if (translatingRef.current) {
        return;
      }
      const target = mutations.find((mutation) => mutation.target)?.target || document.body;
      scheduleTranslation(target.nodeType === Node.ELEMENT_NODE ? target : document.body);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRIBUTES
    });

    return () => {
      observer.disconnect();
      if (pendingFrameRef.current) {
        window.cancelAnimationFrame(pendingFrameRef.current);
      }
    };
  }, [language]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
