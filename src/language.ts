import { isIP } from 'node:net';
import { publicIPv4 } from './network.js';
import english from '../dist/translations/en.json' with { type: 'json' };

export type Language = 'th' | 'en';
export const englishTranslations: Record<string, string> = english;
export function defaultLanguage(saved: unknown, country: string | null, accept = ''): Language {
  if (saved === 'th' || saved === 'en') return saved;
  if (country && /^[A-Z]{2}$/.test(country)) return country === 'TH' ? 'th' : 'en';
  const preferred = accept.split(',').map(part => {
    const [tag, quality] = part.trim().split(';');
    return { language: tag.split('-')[0].toLowerCase(), quality: quality ? Number(quality.replace('q=', '')) : 1 };
  }).filter(item => item.quality > 0).sort((a, b) => b.quality - a.quality)[0];
  return preferred?.language === 'th' ? 'th' : 'en';
}

export function conversationLanguage(text: string): Language | null {
  if (/[\u0e00-\u0e7f]/.test(text)) return 'th';
  // Tickers, timeframes and numbers alone do not express a language preference.
  const words = text.replace(/\b[A-Z0-9]+(?:\/[A-Z0-9]+)?\b|\b\d+[mhdw]\b/g, '').match(/[a-zA-Z]{2,}/g);
  return words?.length ? 'en' : null;
}

export function languageInstruction(language: Language) {
  return `Conversation language: ${language === 'th' ? 'Thai' : 'English'}. Use this language for all user-facing explanations, questions, proposed setup names and summaries. Follow an explicit user request for another language. Preserve user-provided names, symbols, technical identifiers, tool schemas and values. A quoted source or a specialist skill does not change the conversation language. Thai examples apply only when writing Thai.`;
}

export function translateText(text: string, dictionary: Record<string, string> = english) {
  return text.replace(/[\u0e00-\u0e7f]+(?:[ \t]+[\u0e00-\u0e7f]+)*/g, (term, offset) => {
    const translated = dictionary[term];
    if (!translated) return term;
    const before = /[A-Za-z0-9]/.test(text[offset - 1] ?? '') ? ' ' : '';
    const after = /[A-Za-z0-9]/.test(text[offset + term.length] ?? '') ? ' ' : '';
    return before + translated + after;
  });
}

export function countryLookup(fetcher: typeof fetch = fetch) {
  const cache = new Map<string, { expires: number; value: Promise<string | null> }>();
  return async (ip: string): Promise<string | null> => {
    const version = isIP(ip);
    if (!version || (version === 4 && !publicIPv4(ip)) || (version === 6 && !/^[23][0-9a-f]{3}:/i.test(ip))) return null;
    const existing = cache.get(ip);
    if (existing && existing.expires > Date.now()) return existing.value;
    const value = (async () => {
      try {
        // ponytail: free lookup allows 1,000/day; use an edge country header before exceeding that traffic.
        const response = await fetcher(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code`, { signal: AbortSignal.timeout(1000) });
        if (!response.ok) return null;
        const data = await response.json() as { success?: boolean; country_code?: string };
        return data.success === true && /^[A-Z]{2}$/.test(data.country_code ?? '') ? data.country_code! : null;
      } catch { return null; }
    })();
    if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
    cache.set(ip, { expires: Date.now() + 86400000, value });
    return value;
  };
}
