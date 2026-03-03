import { v4 as uuidv4 } from 'uuid';
import { PlaywrightCrawler, ProxyConfiguration, Configuration, log, PlaywrightCrawlingContext } from 'crawlee';
import { IScraper } from './IScraper';
import { ProductScrapeResult, Product, ProductMetrics } from '../../../types';
import { storageService } from '../../storage/services/StorageService';
import { proxyManager } from '../../proxy/services/ProxyManager';
import { convertToUSD } from '../../../services/CurrencyService';
import { logger as baseLogger } from '../../../utils/logger';
import { detectCurrencyFromDomain } from '../../../utils/parsers';
import { syncMetricsPriceFromBuyBox } from '../../../utils/price';
import path from 'path';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(stealthPlugin());

const logger = baseLogger.child({ module: 'CrawleeAdapter' });

// We want to suppress Crawlee's default verbose logging
log.setLevel(log.LEVELS.WARNING);

export class CrawleeAdapter implements IScraper {
  
  async scrapeProduct(url: string): Promise<ProductScrapeResult> {
    try {
      const settings = await storageService.getSettings();
      const strategy = settings.scrapingStrategy || 'hybrid';
      
      let productResult: Product | undefined;
      let failureReason = '';
      let isBlocked = false;

      let region = 'us';
      if (url.includes('amazon.de')) region = 'de';
      else if (url.includes('amazon.co.uk')) region = 'uk';
      else if (url.includes('amazon.it')) region = 'it';
      else if (url.includes('amazon.fr')) region = 'fr';
      else if (url.includes('amazon.es')) region = 'es';

      const proxyString = await proxyManager.getProxyString(region);
      const proxyConfiguration = proxyString 
        ? new ProxyConfiguration({ proxyUrls: [proxyString] }) 
        : undefined;

      // Ensure stable session across retries
      const config = new Configuration({
        persistStorage: false,
      });

      const crawler = new PlaywrightCrawler({
        maxRequestsPerCrawl: 1,
        maxRequestRetries: 0,
        requestHandlerTimeoutSecs: 60,
        navigationTimeoutSecs: 45,
        proxyConfiguration,
        useSessionPool: true,
        sessionPoolOptions: { maxPoolSize: 1 },
        browserPoolOptions: {
            useFingerprints: true,
            fingerprintOptions: {
                fingerprintGeneratorOptions: {
                    devices: ['desktop'],
                    operatingSystems: ['windows', 'macos'],
                    browsers: ['chrome'],
                }
            }
        },
        launchContext: {
          launcher: chromium,
          launchOptions: {
            headless: false,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-infobars',
              '--window-position=0,0',
              '--ignore-certificate-errors',
            ],
          },
        },
        requestHandler: async ({ page, request, session }: PlaywrightCrawlingContext) => {
          logger.info(`[Crawlee] Navigating to: ${request.url}`);
          await page.waitForLoadState('domcontentloaded');
          
          // Simulate human behavior to trigger lazy-loaded elements (like prices on Amazon)
          try {
              await page.mouse.move(Math.random() * 500, Math.random() * 500);
              await page.waitForTimeout(500);
              await page.mouse.wheel(0, 600);
              
              const priceSelectors = '#corePrice_feature_div .a-price, #corePriceDisplay_desktop_feature_div .a-price, #priceblock_ourprice, #price_inside_buybox';
              
              // Try to wait for price
              let priceFound = false;
              try {
                  await page.waitForSelector(priceSelectors, { state: 'attached', timeout: 3000 });
                  priceFound = true;
              } catch (e) {}

              // If price is missing, Amazon might be blocking it due to location. Let's try changing ZIP.
              if (!priceFound && request.url.includes('amazon.')) {
                  logger.info(`[Crawlee] Price not found initially on ${request.url}. Attempting location bypass...`);
                  const zipCode = request.url.includes('amazon.com') ? '10001' : 
                                  request.url.includes('amazon.de') ? '10115' : 
                                  request.url.includes('amazon.co.uk') ? 'E1 6AN' : null;
                  
                  if (zipCode) {
                      let popoverOpened = false;
                      for (let attempt = 0; attempt < 3; attempt++) {
                          await page.evaluate(`
                              var locBtn = document.querySelector('#nav-global-location-popover-link');
                              if (locBtn) locBtn.click();
                          `);
                          try {
                              await page.waitForSelector('#GLUXZipUpdateInput', { state: 'visible', timeout: 3000 });
                              popoverOpened = true;
                              break;
                          } catch (e) {
                              await page.waitForTimeout(1000);
                          }
                      }

                      if (popoverOpened) {
                          await page.fill('#GLUXZipUpdateInput', zipCode);
                          await page.waitForTimeout(500); // short wait for React state to update
                          await page.keyboard.press('Enter'); // The most reliable way to submit the ZIP form
                          
                          await page.evaluate(`
                              var applyBtn = document.querySelector('span[data-action="GLUX-submit-postal-code"] .a-button-input, #GLUXZipUpdate .a-button-input, #GLUXZipUpdate input, input[aria-labelledby="GLUXZipUpdate-announce"]');
                              if (applyBtn) applyBtn.click();
                          `);
                          await page.waitForTimeout(2000);
                          
                          // Sometimes there is a continue button
                          await page.evaluate(`
                              var continueBtn = document.querySelector('.a-popover-footer .a-button-input, #GLUXConfirmClose, [name="glowDoneButton"]');
                              if (continueBtn) continueBtn.click();
                          `);
                          await page.waitForTimeout(1500);
                          
                          await page.reload({ waitUntil: 'domcontentloaded' });
                          await page.waitForTimeout(3000);
                      } else {
                          logger.warn(`[Crawlee] Location bypass popover failed to open after retries.`);
                      }
                  }
              }

              await page.mouse.wheel(0, 600);
              await page.waitForTimeout(800);
              await page.mouse.wheel(0, -1000);
          } catch (e: any) {
              logger.warn(`[Crawlee] Mouse/Wait automation failed, proceeding anyway. ${e.message}`);
          }

          const html = await page.content();
          if (this.isAmazonBlocked(html)) {
            const snapshotDir = path.join(process.cwd(), 'data', 'snapshots');
            try { 
              await page.screenshot({ path: path.join(snapshotDir, `blocked-${uuidv4()}.jpg`), type: 'jpeg', quality: 80, fullPage: true }); 
            } catch (e) {
              logger.warn('[Crawlee] Failed to take blocked snapshot');
            }
            session?.markBad();
            isBlocked = true;
            throw new Error('Blocked by CAPTCHA/Anti-bot');
          }

          // Browser-side Extraction! Highly accurate.
          const extractedData: any = await page.evaluate(`(() => {
            // Inlined functions to prevent TS bundlers from injecting __name
            var rawTitle = '';
            var tEl = document.querySelector('#productTitle');
            var mEl = document.querySelector('meta[property="og:title"]');
            if (tEl && tEl.textContent) rawTitle = tEl.textContent;
            else if (mEl) rawTitle = mEl.getAttribute('content') || '';
            else rawTitle = 'Unknown Product';
            
            var title = rawTitle.replace(/\\s+/g, ' ').trim();

            var priceVal;
            var originalPriceVal;
            var currencyStr;

            var parseSmartPrice = function(text) {
                if (!text) return undefined;
                var str = String(text);
                var match = str.match(/[\\d.,]+/);
                if (!match) return undefined;
                var numStr = match[0];
                var lastComma = numStr.lastIndexOf(',');
                var lastDot = numStr.lastIndexOf('.');
                
                if (lastComma > lastDot) {
                    numStr = numStr.replace(/\\./g, '').replace(',', '.');
                } else if (lastDot > lastComma) {
                    numStr = numStr.replace(/,/g, '');
                } else if (numStr.indexOf(',') !== -1) {
                    if (numStr.length - lastComma === 3) {
                        numStr = numStr.replace(',', '.');
                    } else {
                        numStr = numStr.replace(',', '');
                    }
                }
                var parsed = parseFloat(numStr);
                return isNaN(parsed) ? undefined : parsed;
            };

            var parsePriceFromEl = function(el) {
                if (el && el.textContent) {
                    var price = parseSmartPrice(el.textContent);
                    if (price) {
                        var symbolEl = el.parentElement ? el.parentElement.querySelector('.a-price-symbol') : null;
                        if (symbolEl && symbolEl.textContent) {
                            var symText = symbolEl.textContent.replace(/\\s+/g, '').trim();
                            var cMap = { '$': 'USD', '€': 'EUR', '£': 'GBP' };
                            currencyStr = cMap[symText] || symText;
                        }
                        return price;
                    }
                }
                return undefined;
            };

            // 1. Try BuyBox first per user request
            var buyNowPriceEl = document.querySelector('#buybox .a-price .a-offscreen') || 
                                document.querySelector('#desktop_buybox .a-price .a-offscreen') ||
                                document.querySelector('#buyBoxAccordion .a-price .a-offscreen');
            priceVal = parsePriceFromEl(buyNowPriceEl);

            // 2. Fallback to center core price block
            if (!priceVal) {
                var corePriceEl = document.querySelector('#corePrice_feature_div .priceToPay .a-offscreen') ||
                                  document.querySelector('#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen') ||
                                  document.querySelector('#priceblock_ourprice') ||
                                  document.querySelector('#price_inside_buybox') || 
                                  document.querySelector('#corePrice_desktop .a-price .a-offscreen') ||
                                  document.querySelector('#renewedBuyBoxPrice .a-price .a-offscreen') ||
                                  document.querySelector('#apex_desktop .a-price .a-offscreen') ||
                                  document.querySelector('.a-price.aok-align-center .a-offscreen');
                priceVal = parsePriceFromEl(corePriceEl);
            }

            // Fallback to internal AWS hidden data if still empty
            if (!priceVal) {
                var twisterEl = document.querySelector('#twister-plus-price-data-price');
                if (twisterEl && twisterEl.getAttribute('value')) {
                    var twVal = parseFloat(twisterEl.getAttribute('value') || '');
                    if (!isNaN(twVal)) priceVal = twVal;
                }
            }

            var origPriceEl = document.querySelector('.a-text-price span.a-offscreen') || document.querySelector('.basisPrice span.a-offscreen');
            if (origPriceEl && origPriceEl.textContent) {
                originalPriceVal = parseSmartPrice(origPriceEl.textContent);
            }

            var ratingPopover = document.querySelector('#acrPopover');
            var ratingStr = ratingPopover ? ratingPopover.getAttribute('title') : '';
            var ratingVal;
            if (ratingStr) {
                var match = ratingStr.match(/([\\d.]+)\\s*out of/);
                if (match) ratingVal = parseFloat(match[1]);
            }
            
            var reviewCustomerText = document.querySelector('#acrCustomerReviewText');
            var reviewsCountStr = reviewCustomerText ? reviewCustomerText.textContent : '';
            var reviewsCountVal;
            if (reviewsCountStr) {
                reviewsCountVal = parseInt(reviewsCountStr.replace(/[^\\d]/g, ''), 10);
            }

            var merchantInfo = document.querySelector('#merchant-info');
            var merchantText = merchantInfo && merchantInfo.textContent ? merchantInfo.textContent.toLowerCase() : '';
            
            var buyBoxSeller = 'Unknown';
            var sellerTrigger = document.querySelector('#sellerProfileTriggerId');
            var merchantLink = document.querySelector('#merchant-info a');
            
            if (sellerTrigger && sellerTrigger.textContent) buyBoxSeller = sellerTrigger.textContent.replace(/\\s+/g, ' ').trim();
            else if (merchantLink && merchantLink.textContent) buyBoxSeller = merchantLink.textContent.replace(/\\s+/g, ' ').trim();
            
            var isFBA = merchantText.indexOf('fulfilled by amazon') !== -1;
            var isAmazon = merchantText.indexOf('amazon.com') !== -1;
            if (isAmazon && buyBoxSeller === 'Unknown') buyBoxSeller = 'Amazon';

            var isPrime = !!document.querySelector('#prime_feature_div') || !!document.querySelector('.prime-logo');

            // NEW METRICS
            var asinEl = document.querySelector('#ASIN');
            var asin = asinEl ? asinEl.value : undefined;

            var brandEl = document.querySelector('#bylineInfo') || document.querySelector('#brand');
            var brand = brandEl ? brandEl.textContent.trim() : undefined;

            var availabilityEl = document.querySelector('#availability span');
            var availability = availabilityEl ? availabilityEl.textContent.trim() : undefined;

            var deliveryEl = document.querySelector('#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE span[data-csa-c-type="element"]');
            var deliveryInfo = deliveryEl ? deliveryEl.textContent.replace(/\\s+/g, ' ').trim() : undefined;

            var catEl = document.querySelector('#wayfinding-breadcrumbs_feature_div a');
            var category = catEl ? catEl.textContent.trim() : undefined;

            var features = [];
            var featureEls = document.querySelectorAll('#feature-bullets ul li span.a-list-item');
            for (var i = 0; i < featureEls.length; i++) {
                if (featureEls[i].textContent) features.push(featureEls[i].textContent.trim());
            }

            var imageUrl = undefined;
            var imageUrls = [];
            var imgEl = document.querySelector('#landingImage') || document.querySelector('#imgBlkFront') || document.querySelector('#imgTagWrapperId img');
            if (imgEl) {
               imageUrl = imgEl.getAttribute('src');
               var dataDynamic = imgEl.getAttribute('data-a-dynamic-image');
               if (dataDynamic) {
                  try {
                     var parsed = JSON.parse(dataDynamic);
                     imageUrls = Object.keys(parsed);
                     if (imageUrls.length > 0) imageUrl = imageUrls[0];
                  } catch(e){}
               }
            }

            var salesVolume;
            var salesSelectors = [
              '#social-proofing-faceout-title-tk_bought',
              '#social-proofing-faceout-title-tk_purchase',
              '#socialProofingAsinFaceout_feature_div',
              '#socialProofingAsinFaceout',
              '[data-cy=\"social-proofing-faceout-title-tk_bought\"]'
            ];
            for (var si = 0; si < salesSelectors.length; si++) {
              var svEl = document.querySelector(salesSelectors[si]);
              var svText = svEl && svEl.textContent ? svEl.textContent.replace(/\\s+/g, ' ').trim() : '';
              if (svText && /bought/i.test(svText)) {
                salesVolume = svText;
                break;
              }
            }
            if (!salesVolume) {
              var bodyText = document.body && document.body.textContent ? document.body.textContent.replace(/\\s+/g, ' ') : '';
              var svMatch = bodyText.match(/(?:\\d[\\d,.]*\\+?\\s*)?bought in past month/i);
              if (svMatch) salesVolume = svMatch[0];
            }

            var sellerCountVal;
            var sellerTextBlocks = [
              '#olp-upd-new-used',
              '#aod-asin-count',
              '#olp_feature_div',
              '#dynamic-aod-ingress-box',
              '#alm-buybox-upd-new'
            ];
            for (var sb = 0; sb < sellerTextBlocks.length; sb++) {
              var stEl = document.querySelector(sellerTextBlocks[sb]);
              var st = stEl && stEl.textContent ? stEl.textContent.replace(/\\s+/g, ' ').trim() : '';
              if (!st) continue;
              var cMatch = st.match(/(\\d+)\\s*(?:new|used|offer|sellers?)/i);
              if (cMatch) {
                var parsedCount = parseInt(cMatch[1], 10);
                if (!isNaN(parsedCount) && parsedCount > 0) {
                  sellerCountVal = parsedCount;
                  break;
                }
              }
            }
            if (!sellerCountVal) {
              var fallbackOffers = document.querySelectorAll('#mbc .a-box, #aod-offer, .olpOffer');
              if (fallbackOffers && fallbackOffers.length > 0) sellerCountVal = fallbackOffers.length;
            }

            var bestSellerRank;
            var bsrRankVal;
            var bsrCategoryVal;
            var bsrNode = document.querySelector('#SalesRank') ||
                          (function() {
                            var allTh = document.querySelectorAll('th');
                            for (var ti = 0; ti < allTh.length; ti++) {
                              var thText = allTh[ti].textContent ? allTh[ti].textContent : '';
                              if (/Best Sellers Rank/i.test(thText)) return allTh[ti].nextElementSibling;
                            }
                            return null;
                          })();
            var bsrText = bsrNode && bsrNode.textContent ? bsrNode.textContent.replace(/\\s+/g, ' ').trim() : '';
            if (bsrText) {
              bestSellerRank = bsrText.replace(/Best Sellers Rank/i, '').trim();
              var rankMatch = bsrText.match(/#([\\d,]+)\\s+in\\s+([^#(]+)/i);
              if (rankMatch) {
                var rankNum = parseInt(rankMatch[1].replace(/,/g, ''), 10);
                if (!isNaN(rankNum) && rankNum > 0) bsrRankVal = rankNum;
                bsrCategoryVal = rankMatch[2] ? rankMatch[2].trim() : undefined;
              }
            }

            return {
                title: title,
                price: priceVal,
                originalPrice: originalPriceVal,
                currency: currencyStr,
                averageRating: ratingVal,
                reviewsCount: reviewsCountVal,
                buyBoxSeller: buyBoxSeller,
                isFBA: isFBA,
                isAmazon: isAmazon,
                isPrime: isPrime,
                asin: asin,
                brand: brand,
                availability: availability,
                deliveryInfo: deliveryInfo,
                category: category,
                features: features,
                imageUrl: imageUrl,
                imageUrls: imageUrls,
                salesVolume: salesVolume,
                sellerCount: sellerCountVal,
                bestSellerRank: bestSellerRank,
                bsrRank: bsrRankVal,
                bsrCategory: bsrCategoryVal
            };
          })()`);

          // Build metrics
          let metrics: Partial<ProductMetrics> = {
              price: extractedData.price,
              itemPrice: extractedData.price,
              originalPrice: extractedData.originalPrice,
              averageRating: extractedData.averageRating,
              reviewsCount: extractedData.reviewsCount,
              isPrime: extractedData.isPrime,
              asin: extractedData.asin,
              brand: extractedData.brand,
              availability: extractedData.availability,
              deliveryInfo: extractedData.deliveryInfo,
              category: extractedData.category,
              features: extractedData.features,
              imageUrl: extractedData.imageUrl,
              imageUrls: extractedData.imageUrls,
              salesVolume: extractedData.salesVolume,
              sellerCount: extractedData.sellerCount,
              bestSellerRank: extractedData.bestSellerRank,
          };
          if (extractedData.bsrRank) {
            metrics.bsrCategories = [{
              rank: extractedData.bsrRank,
              category: extractedData.bsrCategory || extractedData.category || 'Unknown',
            }];
          }

          const domainCurrency = detectCurrencyFromDomain(request.url) || 'USD';
          metrics.currency = extractedData.currency || domainCurrency;
          const scrapedAt = new Date().toISOString();
          metrics.buyBox = {
            sellerName: extractedData.buyBoxSeller,
            price: metrics.price || 0,
            isFBA: extractedData.isFBA,
            isAmazon: extractedData.isAmazon,
          };
          metrics = syncMetricsPriceFromBuyBox(metrics, scrapedAt);

          if (metrics.price) {
             metrics.priceUSD = convertToUSD(metrics.price, metrics.currency || 'USD');
             metrics.itemPriceUSD = convertToUSD(metrics.itemPrice || metrics.price, metrics.currency || 'USD');
             
             if (metrics.originalPrice && metrics.originalPrice > metrics.price) {
                 metrics.discountPercentage = Math.round(((metrics.originalPrice - metrics.price) / metrics.originalPrice) * 100);
             }
          }

          // Generate Snapshot
          const snapshotId = uuidv4();
          const snapshotDir = path.join(process.cwd(), 'data', 'snapshots');

          if (metrics.price === undefined) {
             logger.warn(`[Crawlee] Price extraction failed completely. Dumping debug data to noprice-${snapshotId}.jpg and html`);
             try {
                 await page.screenshot({ path: path.join(snapshotDir, `noprice-${snapshotId}.jpg`), type: 'jpeg', quality: 80, fullPage: true });
                 const fs = require('fs');
                 const html = await page.content();
                 fs.writeFileSync(path.join(snapshotDir, `noprice-${snapshotId}.html`), html);
             } catch (err) {}
          } else {
             await page.screenshot({ path: path.join(snapshotDir, `${snapshotId}.jpg`), type: 'jpeg', quality: 80, fullPage: true });
          }
          
          let marketplace = 'unknown';
          if (request.url.includes('amazon')) marketplace = 'amazon';

          productResult = {
            id: uuidv4(),
            title: extractedData.title,
            url: request.url,
            marketplace,
            metrics: metrics as Product['metrics'],
            scrapedAt,
            scrapedBy: 'crawler' // Keeping the original type mapping, though engine is crawlee
          };
          
          logger.info(`[Crawlee] Successfully extracted ${productResult.title} - Price: ${metrics.price || 'N/A'}`);
        },
        failedRequestHandler: async ({ request }: PlaywrightCrawlingContext, error: Error) => {
          logger.error(`[Crawlee] Request failed for ${request.url}: ${error.message}`);
          failureReason = error.message;
          if (proxyString) {
              proxyManager.markAsDead(proxyString);
          }
        },
      }, config);

      await crawler.run([url]);

      if (isBlocked) {
          return { error: 'Amazon blocked the request (CAPTCHA/Robot Check).' };
      }

      if (!productResult) {
        return { error: `Failed to fetch URL. Reason: ${failureReason || 'No product data extracted'}` };
      }

      return { product: productResult };

    } catch (err: any) {
      return { error: `Crawlee engine failed: ${err.message}` };
    }
  }

  private isAmazonBlocked(html: string): boolean {
    if (!html) return true;
    return html.includes('action="/errors/validateCaptcha"') ||
           html.includes('api-services-support@amazon.com') ||
           (html.includes('To discuss automated access to Amazon data') && html.includes('contact'));
  }
}
