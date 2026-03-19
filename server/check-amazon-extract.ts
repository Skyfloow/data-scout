import fs from 'fs';
import * as cheerio from 'cheerio';
import { amazonExtractor } from './src/modules/scraping/selectors/amazon';

(async () => {
  for (const f of ['tmp-b0dpdknpt9.html', 'tmp-b0dpdknpt9-after-fix.html']) {
    if (!fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, 'utf8');
    const $ = cheerio.load(html);
    const r = await amazonExtractor({ url: 'https://www.amazon.com/dp/B0DPDKNPT9?th=1', html, $ });
    const m: any = r.metrics || {};
    console.log('\nfile', f, 'success', r.success);
    console.log('buyBox', m.buyBox);
    console.log('offers', m.offers?.length || 0, (m.offers || []).slice(0, 5));
    console.log('sellerCount', m.sellerCount, 'amazonMetrics offers', m.amazonMetrics?.offers?.length);
  }
})();
