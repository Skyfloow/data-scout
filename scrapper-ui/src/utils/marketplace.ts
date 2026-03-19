export function getMarketplaceDisplayName(marketplace?: string, sourceUrl?: string): string {
  const normalizedMarketplace = String(marketplace || '').trim().toLowerCase();

  const hostFromUrl = (() => {
    const raw = String(sourceUrl || '').trim();
    if (!raw) return '';
    try {
      return new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return '';
    }
  })();

  if (hostFromUrl.includes('amazon.') || hostFromUrl.includes('etsy.')) return hostFromUrl;
  if (normalizedMarketplace.includes('.')) return normalizedMarketplace;
  if (normalizedMarketplace === 'amazon') return 'amazon.com';
  if (normalizedMarketplace === 'etsy') return 'etsy.com';
  return normalizedMarketplace || 'unknown';
}
