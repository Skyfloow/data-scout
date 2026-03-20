import { describe, expect, it, vi, afterEach } from 'vitest';
import { fetchAmazonOffers } from '../src/modules/scraping/selectors/amazon-offers';
import { fetcher } from '../src/modules/scraping/network/Fetcher';

describe('fetchAmazonOffers language param by Amazon domain', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds language=en_GB for amazon.com.mx AOD endpoints', async () => {
    const spy = vi.spyOn(fetcher, 'fetchHtml').mockResolvedValue({
      success: false,
      html: '',
      error: 'mock',
    });

    await fetchAmazonOffers('B000000000', 'MXN', 'https://www.amazon.com.mx/dp/B000000000');

    expect(spy).toHaveBeenCalled();
    const firstCallUrl = String(spy.mock.calls[0]?.[0] || '');
    expect(firstCallUrl).toContain('language=en_GB');
  });

  it('does not force language param for amazon.com AOD endpoints', async () => {
    const spy = vi.spyOn(fetcher, 'fetchHtml').mockResolvedValue({
      success: false,
      html: '',
      error: 'mock',
    });

    await fetchAmazonOffers('B000000000', 'USD', 'https://www.amazon.com/dp/B000000000');

    expect(spy).toHaveBeenCalled();
    const firstCallUrl = String(spy.mock.calls[0]?.[0] || '');
    expect(firstCallUrl).not.toContain('language=en_GB');
  });
});
