const parseLocaleNumber = (value: string): number => {
  if (!value) return 0;

  let normalized = value
    .replace(/\u00A0/g, ' ')
    .replace(/[^\d.,'\s]/g, '')
    .replace(/'/g, '')
    .replace(/\s+/g, '');

  if (!normalized || !/\d/.test(normalized)) return 0;

  const hasDot = normalized.includes('.');
  const hasComma = normalized.includes(',');

  if (hasDot && hasComma) {
    const lastDot = normalized.lastIndexOf('.');
    const lastComma = normalized.lastIndexOf(',');
    const decimalSeparator = lastDot > lastComma ? '.' : ',';
    const thousandsSeparator = decimalSeparator === '.' ? ',' : '.';
    normalized = normalized.split(thousandsSeparator).join('');
    if (decimalSeparator === ',') normalized = normalized.replace(',', '.');
  } else if (hasComma) {
    const parts = normalized.split(',');
    if (parts.length > 1) {
      const last = parts[parts.length - 1];
      if (last.length === 2) {
        normalized = `${parts.slice(0, -1).join('')}.${last}`;
      } else if (last.length === 3 && parts.length > 2) {
        normalized = parts.join('');
      } else if (last.length === 3) {
        normalized = parts.join('');
      } else {
        normalized = `${parts.slice(0, -1).join('')}.${last}`;
      }
    }
  } else if (hasDot) {
    const parts = normalized.split('.');
    if (parts.length > 1) {
      const last = parts[parts.length - 1];
      if (last.length === 3 && parts.length > 2) {
        normalized = parts.join('');
      } else if (last.length === 3) {
        normalized = parts.join('');
      }
    }
  }

  const parsed = parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100000000) return 0;
  return parsed;
};

export const parsePrice = (text: string): number => {
  if (!text) return 0;

  const normalized = text
    .replace(/\u00A0/g, ' ')
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return 0;

  const hasInstallmentContext = (source: string): boolean =>
    /(?:\/\s*mo\b|\/\s*month\b|per\s+month|monthly|installment|apr|interest|equal\s+payments|subscription)/i.test(source);
  const hasUnitContext = (source: string): boolean =>
    /(?:\/\s*ounce|\/\s*oz\b|\/\s*lb\b|\/\s*kg\b|\/\s*g\b|\/\s*count\b|per\s+ounce|per\s+count|per\s+unit)/i.test(source);

  // Capture price-like tokens and avoid concatenating unrelated numbers
  // from the same string (e.g. "$23.99 ($2.40 / Ounce)").
  const priceTokenRegex = /(?:[$€£¥₹₺₽₪₩]|USD|EUR|GBP|JPY|CAD|AUD|BRL|INR|TRY|PLN|SEK|AED|SAR|EGP|MXN|CHF|NOK|DKK|CZK|HUF|RON|SGD|HKD)?\s*\d[\d.,'\s]*/gi;
  const candidates: Array<{ parsed: number; score: number; index: number }> = [];

  for (const match of normalized.matchAll(priceTokenRegex)) {
    const token = (match[0] || '').trim();
    if (!token) continue;
    const parsed = parseLocaleNumber(token);
    if (parsed <= 0) continue;
    const idx = match.index ?? 0;
    const context = normalized.slice(Math.max(0, idx - 24), Math.min(normalized.length, idx + token.length + 24));

    if (/%/.test(context)) continue;
    if (hasInstallmentContext(context)) continue;

    let score = 10;
    if (hasUnitContext(context)) score -= 6;
    if (/[$€£¥₹₺₽₪₩]|USD|EUR|GBP|JPY|CAD|AUD|BRL|INR|TRY|PLN|SEK|AED|SAR|EGP|MXN|CHF|NOK|DKK|CZK|HUF|RON|SGD|HKD/i.test(token)) {
      score += 4;
    }

    candidates.push({ parsed, score, index: idx });
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });
    const best = candidates[0];
    if (best) return best.parsed;
  }

  return parseLocaleNumber(normalized);
};

/**
 * Detects currency based on the Amazon domain TLD.
 * This is the most reliable source — Amazon serves prices in the local currency of the domain,
 * regardless of the user's geo-IP or headers.
 */
export const detectCurrencyFromDomain = (url: string): string | null => {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    
    // Amazon domain → currency mapping
    const domainCurrencyMap: Record<string, string> = {
      'amazon.com':     'USD',
      'amazon.ca':      'CAD',
      'amazon.com.mx':  'MXN',
      'amazon.com.br':  'BRL',
      'amazon.co.uk':   'GBP',
      'amazon.de':      'EUR',
      'amazon.fr':      'EUR',
      'amazon.it':      'EUR',
      'amazon.es':      'EUR',
      'amazon.nl':      'EUR',
      'amazon.be':      'EUR',
      'amazon.co.jp':   'JPY',
      'amazon.in':      'INR',
      'amazon.com.au':  'AUD',
      'amazon.sg':      'SGD',
      'amazon.ae':      'AED',
      'amazon.sa':      'SAR',
      'amazon.com.tr':  'TRY',
      'amazon.pl':      'PLN',
      'amazon.se':      'SEK',
      'amazon.eg':      'EGP',
    };

    // Try exact match (with and without www.)
    const cleanHostname = hostname.replace(/^www\./, '');
    if (domainCurrencyMap[cleanHostname]) {
      return domainCurrencyMap[cleanHostname];
    }

    // Try partial match for subdomains like smile.amazon.com
    for (const [domain, currency] of Object.entries(domainCurrencyMap)) {
      if (cleanHostname.endsWith(domain)) {
        return currency;
      }
    }

    return null;
  } catch {
    return null;
  }
};

const extractCurrencyFromText = (text: string): string | null => {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (text.includes('C$') || /(?:\bcad\b|can\$)/i.test(text)) return 'CAD';
  if (text.includes('A$') || /\baud\b/i.test(text)) return 'AUD';
  if (text.includes('R$') || lower.includes('brl')) return 'BRL';
  if (text.includes('€') || lower.includes('eur')) return 'EUR';
  if (text.includes('£') || lower.includes('gbp')) return 'GBP';
  if (text.includes('₹') || lower.includes('inr')) return 'INR';
  if (text.includes('₺') || lower.includes('try')) return 'TRY';
  if (text.includes('zł') || lower.includes('pln')) return 'PLN';
  if (text.includes('kr') || lower.includes('sek')) return 'SEK';
  if (text.includes('¥') || lower.includes('jpy') || lower.includes('cny')) return 'JPY';
  if (text.includes('$') || /\busd\b|us\$/i.test(text)) return 'USD';
  return null;
};

export const detectCurrencyFromText = (text: string): string | null => {
  return extractCurrencyFromText(text);
};

export const detectCurrencyFromUrlParam = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    const keys = ['currency', 'currencyCode', 'currencycode', 'curr'];
    for (const key of keys) {
      const raw = parsed.searchParams.get(key);
      if (!raw) continue;
      const normalized = raw.trim().toUpperCase();
      if (/^[A-Z]{3}$/.test(normalized)) return normalized;
      const fromText = extractCurrencyFromText(raw);
      if (fromText) return fromText;
    }
  } catch {
    // ignore
  }
  return null;
};

/**
 * Detects currency from the price symbol text.
 * Only used as a fallback when domain-based detection is not available.
 */
export const parseCurrency = (text: string): string => {
  return extractCurrencyFromText(text) || 'USD';
};

export const parseStockCount = (text: string): number | null => {
  if (!text) return null;
  const lowerText = text.toLowerCase();
  
  // e.g., "Only 3 left in stock" -> 3
  const exactMatch = lowerText.match(/(\d+)\s+left/);
  if (exactMatch && exactMatch[1]) {
    return parseInt(exactMatch[1], 10);
  }

  // German: "Nur noch 3 auf Lager" / "Nur noch 3 Stück auf Lager"
  const deMatch = lowerText.match(/nur\s+noch\s+(\d+)\s+(?:st[üu]ck\s+)?auf\s+lager/);
  if (deMatch?.[1]) return parseInt(deMatch[1], 10);

  // Italian: "Solo 3 rimasti" / "Solo 3 rimasti in magazzino"
  const itMatch = lowerText.match(/solo\s+(\d+)\s+rimasti(?:\s+in\s+magazzino)?/);
  if (itMatch?.[1]) return parseInt(itMatch[1], 10);

  // French: "Plus que 3 en stock" / "Il ne reste plus que 3"
  const frMatch = lowerText.match(/(?:plus\s+que\s+(\d+)\s+en\s+stock|il\s+ne\s+reste\s+plus\s+que\s+(\d+))/);
  if (frMatch?.[1]) return parseInt(frMatch[1], 10);
  if (frMatch?.[2]) return parseInt(frMatch[2], 10);

  // Spanish: "Solo quedan 3" / "Quedan 3"
  const esMatch = lowerText.match(/(?:solo\s+)?quedan\s+(\d+)/);
  if (esMatch?.[1]) return parseInt(esMatch[1], 10);
  
  if (
    lowerText.includes('out of stock')
    || lowerText.includes('currently unavailable')
    || lowerText.includes('derzeit nicht verfügbar')
    || lowerText.includes('non disponibile')
    || lowerText.includes('actuellement indisponible')
    || lowerText.includes('no disponible')
  ) {
    return 0;
  }
  
  if (
    lowerText.includes('in stock')
    || lowerText.includes('available')
    || lowerText.includes('auf lager')
    || lowerText.includes('disponibile')
    || lowerText.includes('en stock')
    || lowerText.includes('disponible')
  ) {
    return 999; // Arbitrary high number meaning "plenty"
  }
  
  return null;
};
