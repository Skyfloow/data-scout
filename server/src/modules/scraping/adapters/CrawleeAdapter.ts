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
import fs from 'fs';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as cheerio from 'cheerio';
import { PlatformExtractor } from '../extractors/PlatformExtractor';
import { metadataExtractor } from '../extractors/MetadataExtractor';
import { llmSelectorCache } from '../extractors/LLMSelectorCache';

import { fetcher, FetchResult } from '../network/Fetcher';
import { playwrightFetcher } from '../network/PlaywrightFetcher';
import { extractAmazonSerp } from '../extractors/amazonSerp';
import { extractEtsySerp } from '../extractors/etsySerp';
import { SerpResult } from '../../../types';
import { config } from '../../../config';

chromium.use(stealthPlugin());

const logger = baseLogger.child({ module: 'CrawleeAdapter' });
log.setLevel(log.LEVELS.WARNING);

export class CrawleeAdapter implements IScraper {
  private extractAsinFromUrl(url: string): string | null {
      const match = url.match(/\/dp\/([A-Z0-9]{10})/i)
          || url.match(/\/product\/([A-Z0-9]{10})/i)
          || url.match(/\/gp\/product\/([A-Z0-9]{10})/i)
          || url.match(/asin=([A-Z0-9]{10})/i);
      return match ? match[1].toUpperCase() : null;
  }

  private normalizeTargetUrl(rawUrl: string): string {
      try {
          const parsed = new URL(rawUrl);
          const host = parsed.hostname.toLowerCase();
          if (!host.includes('amazon.')) return rawUrl;

          const asin = this.extractAsinFromUrl(rawUrl);
          if (!asin) return rawUrl;

          const normalized = new URL(`${parsed.protocol}//${parsed.host}/dp/${asin}`);
          const th = parsed.searchParams.get('th');
          if (th && /^[0-9A-Za-z_-]{1,8}$/.test(th)) {
              normalized.searchParams.set('th', th);
          }
          return normalized.toString();
      } catch {
          return rawUrl;
      }
  }

  private async fetchAodHtmlFromSession(page: any, url: string): Promise<string> {
      const asin = this.extractAsinFromUrl(url);
      if (!asin) return '';
      try {
          const maxPages = (() => {
              const parsed = Number.parseInt(process.env.AMAZON_AOD_MAX_PAGES || '50', 10);
              return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
          })();
          const result = await page.evaluate(async ({ asinInPage, maxPagesInPage }: { asinInPage: string; maxPagesInPage: number }) => {
              const __name = (value: any) => value;
              const chunks: string[] = [];
              const seenOfferIds = new Set<string>();
              let duplicatePageStreak = 0;
              const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

              const extractOfferIds = (html: string): string[] => {
                  const ids: string[] = [];
                  const byInput = html.matchAll(/name=\"items\\[0\\.base\\]\\[offerListingId\\]\"\\s+value=\"([^\"]+)\"/g);
                  for (const match of byInput) {
                      if (match[1]) ids.push(match[1]);
                  }
                  const byJsonOid = html.matchAll(/\"oid\"\\s*:\\s*\"([^\"]+)\"/g);
                  for (const match of byJsonOid) {
                      if (match[1]) ids.push(match[1]);
                  }
                  return ids;
              };
              const countOfferRows = (html: string): number =>
                  (html.match(/id=\"aod-offer\"|class=\"[^\"]*aod-information-block[^\"]*\"|id=\"aod-pinned-offer\"|class=\"[^\"]*olpOffer[^\"]*\"/g) || []).length;

              for (let pageNo = 1; pageNo <= maxPagesInPage; pageNo += 1) {
                  const endpoints = [
                      `/gp/product/ajax/ref=aod_page_${pageNo - 1}?asin=${asinInPage}&pc=dp&experienceId=aodAjaxMain&pageno=${pageNo}`,
                      `/gp/product/ajax/ref=aod_page_${pageNo}?asin=${asinInPage}&pc=dp&experienceId=aodAjaxMain&pageno=${pageNo}`,
                      `/gp/product/ajax/ref=aod_page_${pageNo - 1}?asin=${asinInPage}&pc=dp&experienceId=aodAjaxMain`,
                      `/gp/offer-listing/${asinInPage}/ref=dp_olp_NEW_mbc?ie=UTF8&condition=new&pageno=${pageNo}`,
                  ];
                  let html = '';
                  for (const endpoint of endpoints) {
                      try {
                          const res = await fetch(endpoint, {
                              method: 'GET',
                              credentials: 'include',
                              headers: {
                                  'x-requested-with': 'XMLHttpRequest',
                                  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                              },
                          });
                          if (!res.ok) continue;
                          const candidate = await res.text();
                          const rows = countOfferRows(candidate);
                          if (rows > 0) {
                              html = candidate;
                              break;
                          }
                      } catch {
                          // Try next endpoint.
                      }
                  }
                  if (!html) break;

                  const offerIds = extractOfferIds(html);
                  const offerRows = countOfferRows(html);
                  const beforeCount = seenOfferIds.size;
                  for (const offerId of offerIds) seenOfferIds.add(offerId);
                  const newOfferIds = seenOfferIds.size - beforeCount;

                  chunks.push(html);
                  if (offerRows === 0 && pageNo > 1) break;

                  // Some AOD pages do not expose stable offer IDs. Allow one duplicate page before stopping.
                  if (pageNo > 1 && offerRows > 0 && newOfferIds === 0) {
                      duplicatePageStreak += 1;
                  } else {
                      duplicatePageStreak = 0;
                  }
                  if (duplicatePageStreak >= 2) break;
                  await sleep(250);
              }

              return {
                  html: chunks.join('\n<!-- AOD_PAGE_BREAK -->\n'),
                  pagesLoaded: chunks.length,
                  uniqueOfferIds: seenOfferIds.size,
              };
          }, { asinInPage: asin, maxPagesInPage: maxPages });
          const remoteHtml = typeof result?.html === 'string' ? result.html : '';
          logger.info(`[Crawlee] Session AOD pages loaded: ${result?.pagesLoaded || 0}, uniqueOfferIds=${result?.uniqueOfferIds || 0}, htmlLen=${remoteHtml.length}`);
          return remoteHtml;
      } catch {
          return '';
      }
  }

  private async extractAodOffersFromDom(page: any): Promise<Array<Record<string, any>>> {
      try {
          const offers = await page.evaluate(`(async () => {
              const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
              const isVisible = (el) => {
                  if (!(el instanceof HTMLElement)) return false;
                  const style = window.getComputedStyle(el);
                  return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
              };
              const parsePrice = (value) => {
                  const cleaned = (value || '').replace(/[^0-9.,]/g, '');
                  if (!cleaned) return 0;
                  const normalized = cleaned.includes(',') && cleaned.includes('.')
                      ? cleaned.replace(/,/g, '')
                      : cleaned.replace(',', '.');
                  const parsed = parseFloat(normalized);
                  return Number.isFinite(parsed) ? parsed : 0;
              };
              const extractSellerId = (href) => {
                  const raw = normalize(href || '');
                  if (!raw) return '';
                  const match = raw.match(/[?&](?:seller|smid)=([^&#]+)/i);
                  return normalize(match?.[1] || '').toLowerCase();
              };
              const isLikelyOfferNode = (node) => {
                  const id = normalize(node.getAttribute('id') || '').toLowerCase();
                  if (id === 'aod-offer-price' || id === 'aod-offer-list' || id === 'aod-offer-heading' || id === 'aod-offer-availability') return false;
                  if (id.startsWith('aod-offer-') && /(price|list|heading|availability|soldby|quantity)/i.test(id)) return false;
                  const hasPriceEl = node.querySelector('#aod-offer-price, .aod-offer-price, .a-price .a-offscreen, .a-price, [id^=\"aod-price-\"]');
                  return Boolean(hasPriceEl);
              };
              const offerSelector = [
                  '#aod-pinned-offer',
                  '#aod-offer-list > #aod-offer',
                  '#aod-retail-other-offers-content > #aod-offer',
                  '#all-offers-display #aod-offer',
                  '#aod-offer-list > .aod-offer',
                  '#aod-retail-other-offers-content > .aod-offer',
                  '#all-offers-display .aod-offer',
                  '.aod-offer',
                  '#aod-offer-list > .aod-information-block',
                  '#aod-retail-other-offers-content > .aod-information-block',
                  '.aod-information-block',
                  '[id^="aod-offer-"]',
              ].join(', ');
              const getOfferNodes = () => Array.from(document.querySelectorAll(offerSelector)).filter(isLikelyOfferNode);
              const offersMap = new Map();

              const collectVisibleOffers = async () => {
                  const offerNodes = getOfferNodes();
                  for (const offerNode of offerNodes) {
                  const hasPriceEl = offerNode.querySelector('#aod-offer-price, .aod-offer-price, .a-price .a-offscreen, .a-price, [id^=\"aod-price-\"]');
                  if (!hasPriceEl) continue;

                  const text = normalize(offerNode.innerText || offerNode.textContent || '');
                  const offerId = normalize(
                      offerNode.getAttribute('id')
                      || offerNode.getAttribute('data-csa-c-item-id')
                      || offerNode.getAttribute('data-aod-atc-action')
                      || (((offerNode.querySelector('input[name*=\"offeringID\"]') || {}).value) || '')
                      || (((offerNode.querySelector('input[name*=\"offerListingID\"]') || {}).value) || '')
                  ) || undefined;
                  const sellerLinkNode = offerNode.querySelector('#aod-offer-soldBy a[href], .aod-offer-soldBy a[href], a[href*="seller="], a[href*="smid="]');
                  const offerHref = normalize(
                      (sellerLinkNode && typeof sellerLinkNode.getAttribute === 'function' ? (sellerLinkNode.getAttribute('href') || '') : '')
                  );
                  const offerUrl = offerHref
                      ? (offerHref.startsWith('http') ? offerHref : (location.origin + (offerHref.startsWith('/') ? '' : '/') + offerHref))
                      : undefined;
                  let priceText =
                      normalize((offerNode.querySelector('.a-price .a-offscreen') || {}).innerText || '')
                      || normalize((offerNode.querySelector('.aod-offer-price .a-offscreen') || {}).innerText || '')
                      || normalize((offerNode.querySelector('[id^=\"aod-price-\"] .a-offscreen') || {}).innerText || '');
                  if (!priceText) {
                      const priceFromText = text.match(/(?:[$€£]|USD|EUR|GBP)\\s?\\d[\\d,.]*/i)?.[0];
                      if (priceFromText) priceText = priceFromText;
                  }
                  const price = parsePrice(priceText);
                  if (!(price > 0)) continue;

                  const sellerNode =
                      offerNode.querySelector('#aod-offer-soldBy a')
                      || offerNode.querySelector('.aod-offer-soldBy a')
                      || offerNode.querySelector('#aod-offer-soldBy')
                      || offerNode.querySelector('.aod-offer-soldBy');
                  let sellerName = normalize((sellerNode || {}).innerText || '');
                  if (!sellerName) {
                      const soldBy = text.match(/sold by\\s+(.+?)(?:\\s+and\\s+fulfilled by|\\s+ships from|\\s+delivery|\\s+\\$|$)/i)?.[1];
                      const shipperSeller = text.match(/shipper\\s*\\/\\s*seller\\s+(.+?)(?:\\s+condition|\\s+quantity|\\s+delivery|\\s+\\$|$)/i)?.[1];
                      const fromAtcAria = text.match(/from seller\\s+(.+?)\\s+and\\s+price/i)?.[1];
                      sellerName = normalize(soldBy || shipperSeller || fromAtcAria || '');
                  }
                  if (!sellerName) sellerName = 'Third-party Seller';

                  const condition = normalize(
                      ((offerNode.querySelector('#aod-offer-heading h5') || {}).innerText)
                      || ((offerNode.querySelector('.aod-offer-heading') || {}).innerText)
                      || 'New'
                  );
                  const availability = normalize(
                      ((offerNode.querySelector('#aod-offer-availability') || {}).innerText)
                      || ((offerNode.querySelector('.aod-offer-availability') || {}).innerText)
                      || 'In Stock'
                  );
                  const deliveryInfo = normalize(
                      ((offerNode.querySelector('.aod-delivery-promise') || {}).innerText)
                      || ((offerNode.querySelector('#aod-offer-price .aod-ship-speed') || {}).innerText)
                      || ''
                  );

                  const quantityCandidates = [];
                  const qtyTextMatch = text.match(/quantity\\s*[:\\-]?\\s*(\\d+)/i);
                  if (qtyTextMatch?.[1]) quantityCandidates.push(parseInt(qtyTextMatch[1], 10));
                  const leftMatch = text.match(/(?:only\\s+)?(\\d+)\\s+left in stock/i);
                  if (leftMatch?.[1]) quantityCandidates.push(parseInt(leftMatch[1], 10));

                  offerNode.querySelectorAll('select[name*="quantity"] option, #quantity option, .aod-quantity select option').forEach((opt) => {
                      const raw = opt.value || opt.innerText || '';
                      const parsed = parseInt(raw.replace(/[^\\d]/g, ''), 10);
                      if (Number.isFinite(parsed) && parsed > 0) quantityCandidates.push(parsed);
                  });

                  const qtyTrigger =
                      offerNode.querySelector('[aria-label*="Quantity"]')
                      || offerNode.querySelector('.aod-quantity .a-button-text')
                      || offerNode.querySelector('[id*="aod-quantity"] .a-button-text');
                  if (qtyTrigger && qtyTrigger instanceof HTMLElement) {
                      try {
                          qtyTrigger.click();
                          await sleep(120);
                          document.querySelectorAll('.a-dropdown-item, [role="listbox"] [role="option"]').forEach((item) => {
                              const parsed = parseInt((item.innerText || '').replace(/[^\\d]/g, ''), 10);
                              if (Number.isFinite(parsed) && parsed > 0) quantityCandidates.push(parsed);
                          });
                          qtyTrigger.click();
                          await sleep(60);
                      } catch {
                      }
                  }

                  const stockCount = quantityCandidates.length ? Math.max(...quantityCandidates) : null;
                  const isFBA = /fulfilled by amazon|amazon\\.com/i.test(text.toLowerCase());
                  const sellerId = extractSellerId(offerUrl);
                  const offerKey = sellerId
                      ? ['seller-id', sellerId, price.toFixed(2), normalize(condition || 'New').toLowerCase()].join('|')
                      : ['seller', normalize(sellerName).toLowerCase(), price.toFixed(2), normalize(condition || 'New').toLowerCase()].join('|');

                  if (!offersMap.has(offerKey)) {
                      offersMap.set(offerKey, {
                      offerId,
                      offerUrl,
                      sellerName,
                      price,
                      stockStatus: availability || 'In Stock',
                      stockCount,
                      condition: condition || 'New',
                      deliveryInfo: deliveryInfo || undefined,
                      isFBA,
                      });
                  }
                }
              };

              const getScrollRoot = () => {
                  const roots = [
                    '#all-offers-display',
                    '#aod-container',
                    '#aod-offer-list',
                    '#aod-retail-other-offers-content',
                    '.aod-v3-content'
                  ];
                  for (const selector of roots) {
                      const node = document.querySelector(selector);
                      if (node && isVisible(node) && node.scrollHeight - node.clientHeight > 20) return node;
                  }
                  return null;
              };
                  const isSafeActionNode = (node) => {
                      const tag = (node.tagName || '').toLowerCase();
                      if (tag !== 'a') return true;
                      const href = normalize(node.getAttribute('href') || '');
                      const hrefLower = href.toLowerCase();
                      if (!hrefLower || hrefLower === '#' || hrefLower.startsWith('javascript:')) return true;
                      try {
                          const parsed = new URL(href, location.origin);
                          if (parsed.origin !== location.origin) return false;
                          const pathAndQuery = (parsed.pathname + parsed.search).toLowerCase();
                          return /aod|offer-listing|pageno=|experienceid=aodajaxmain/.test(pathAndQuery);
                      } catch {
                          return false;
                      }
                  };
                  const clickProgressControl = async (root) => {
                  const selector = 'button, input[type="button"], input[type="submit"], div[role="button"], span[role="button"], a[role="button"]';
                  const controls = Array.from(new Set([
                      ...Array.from(root.querySelectorAll(selector)),
                      ...Array.from(document.querySelectorAll(selector)),
                  ]));
                  for (const node of controls) {
                      if (!isVisible(node)) continue;
                      if (!isSafeActionNode(node)) continue;
                      const txt = normalize((node.value || '') + ' ' + (node.innerText || node.textContent || '')).toLowerCase();
                      if (/show more|see more|more offers|more buying choices|load more/.test(txt)) {
                          node.click();
                          await sleep(700);
                          return true;
                      }
                  }
                  return false;
              };
              const scrollRootToBottom = async (root) => {
                  if (!(root instanceof HTMLElement)) return;
                  const maxScroll = Math.max(0, root.scrollHeight - root.clientHeight);
                  if (maxScroll <= 0) return;
                  const checkpoints = [0.55, 0.82, 1];
                  for (const ratio of checkpoints) {
                      root.scrollTop = Math.floor(maxScroll * ratio);
                      root.dispatchEvent(new Event('scroll', { bubbles: true }));
                      await sleep(120);
                  }
              };

              let stableTicks = 0;
              let iterations = 0;
              while (iterations < 80 && stableTicks < 12) {
                  iterations += 1;
                  const before = offersMap.size;
                  await collectVisibleOffers();

                  const root = getScrollRoot();
                  if (root instanceof HTMLElement) {
                      await scrollRootToBottom(root);
                  }
                  await sleep(450);
                  if (root instanceof HTMLElement) {
                    await clickProgressControl(root);
                    await scrollRootToBottom(root);
                  }
                  await collectVisibleOffers();

                  const after = offersMap.size;
                  stableTicks = after > before ? 0 : stableTicks + 1;
              }

              return Array.from(offersMap.values());
          })()`);
          return Array.isArray(offers) ? offers : [];
      } catch (err: any) {
          logger.warn(`[Crawlee] Failed to extract AOD offers from DOM: ${err.message}`);
          return [];
      }
  }
  
  private async cleanupSnapshots(): Promise<void> {
    try {
      const snapshotDir = path.join(process.cwd(), 'data', 'snapshots');
      if (!fs.existsSync(snapshotDir)) return;
      const files = await fs.promises.readdir(snapshotDir);
      for (const file of files) {
        if (file.endsWith('.jpg') || file.endsWith('.jpeg')) {
          await fs.promises.unlink(path.join(snapshotDir, file)).catch(() => {});
        }
      }
    } catch (err) {
      logger.warn(`Failed to cleanup snapshots: ${(err as Error).message}`);
    }
  }

  private async attemptLocationBypass(page: any, url: string): Promise<boolean> {
      logger.info(`[Crawlee] Price not found initially on ${url}. Attempting location bypass...`);
      const zipCode = url.includes('amazon.com') ? '10001' : 
                      url.includes('amazon.de') ? '10115' : 
                      url.includes('amazon.co.uk') ? 'E1 6AN' : null;
      
      if (!zipCode) return false;

      // Handle any pre-existing modals (like cookies or location warning) before clicking the zip code popover
      try {
          await page.evaluate(`
              var preModalBtns = Array.from(document.querySelectorAll('input[type="submit"], button, .a-button-input, span.a-button-inner input'));
              var continueBtn = preModalBtns.find(el => {
                  var text = (el.value || el.innerText || '').toLowerCase();
                  return text.includes('continue') || text.includes('accept') || text.includes('agree');
              });
              if (continueBtn) continueBtn.click();
              
              var dismissBtn = document.querySelector('[data-action="a-popover-close"]');
              if (dismissBtn) dismissBtn.click();
          `);
          await page.waitForTimeout(1000);
      } catch(e) {}

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
          await page.waitForTimeout(500);
          await page.keyboard.press('Enter');
          
          await page.evaluate(`
              var applyBtn = document.querySelector('span[data-action="GLUX-submit-postal-code"] .a-button-input, #GLUXZipUpdate .a-button-input, #GLUXZipUpdate input, input[aria-labelledby="GLUXZipUpdate-announce"]');
              if (applyBtn) applyBtn.click();
          `);
          await page.waitForTimeout(2000);
          
          await page.evaluate(`
              var continueBtn = document.querySelector('.a-popover-footer .a-button-input, #GLUXConfirmClose, [name="glowDoneButton"]');
              if (continueBtn) continueBtn.click();
          `);
          await page.waitForTimeout(1500);
          
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(3000);
          return true;
      } else {
          logger.warn(`[Crawlee] Location bypass popover failed to open.`);
          return false;
      }
  }

  private async forceAmazonUsdCurrency(page: any, url: string): Promise<boolean> {
      try {
          if (!/amazon\.com/i.test(url)) return false;

          const detectCurrency = async (): Promise<string> => {
              try {
                  return await page.evaluate(() => {
                      const selectors = [
                          '#corePrice_feature_div .a-offscreen',
                          '#corePriceDisplay_desktop_feature_div .a-offscreen',
                          '#apex_desktop .a-offscreen',
                          '#aod-offer .a-price .a-offscreen',
                          '.a-price .a-offscreen',
                          '#priceblock_ourprice',
                          '#priceblock_dealprice',
                          '#price_inside_buybox',
                      ];
                      const text = selectors
                          .map((selector) => {
                              const node = document.querySelector(selector);
                              return (node && ((node as HTMLElement).innerText || node.textContent || '')) || '';
                          })
                          .join(' ')
                          .replace(/\s+/g, ' ')
                          .trim();
                      if (!text) return '';
                      if (/\$|USD/i.test(text)) return 'USD';
                      if (/€|EUR/i.test(text)) return 'EUR';
                      if (/£|GBP/i.test(text)) return 'GBP';
                      return 'OTHER';
                  });
              } catch {
                  return '';
              }
          };

          const beforeCurrency = await detectCurrency();
          if (!beforeCurrency || beforeCurrency === 'USD') return false;

          const targetUrl = (() => {
              try {
                  const parsed = new URL(url);
                  parsed.searchParams.set('currency', 'USD');
                  return parsed.toString();
              } catch {
                  return url;
              }
          })();

          try {
              await page.context().addCookies([
                  {
                      name: 'i18n-prefs',
                      value: 'USD',
                      domain: '.amazon.com',
                      path: '/',
                      httpOnly: false,
                      secure: true,
                  },
              ]);
          } catch {
              // Ignore cookie errors and proceed with URL-based forcing.
          }

          try {
              await page.evaluate(() => {
                  document.cookie = 'i18n-prefs=USD; path=/; domain=.amazon.com';
              });
          } catch {
              // Ignore in-page cookie errors.
          }

          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(800);

          const afterCurrency = await detectCurrency();
          logger.info(`[Crawlee] Currency force attempt: ${beforeCurrency || 'unknown'} -> ${afterCurrency || 'unknown'}`);
          return afterCurrency === 'USD';
      } catch (err: any) {
          logger.warn(`[Crawlee] Failed to force USD currency: ${err.message}`);
          return false;
      }
  }

  private async expandAmazonOtherSellers(page: any): Promise<void> {
      try {
          const openers = [
              '#dynamic-aod-ingress-box a',
              '#dynamic-aod-ingress-box button',
              '#dynamic-aod-ingress-box_feature_div a',
              '#dynamic-aod-ingress-box_feature_div button',
              '#aod-ingress-link',
              '#aod-ingress-container a',
              '#aod-ingress-container button',
              'a[href*="aodAjaxMain"]',
              '#olp_feature_div a',
              '#olp-upd-new a',
              '#olp-upd-new-used a',
              'a:has-text("Other sellers on Amazon")',
              'button:has-text("Other sellers on Amazon")',
              'a:has-text("Other Sellers on Amazon")',
              'a:has-text("other buying options")',
              'a:has-text("New & Used")',
              'a:has-text("new from")',
              'a:has-text("See All Buying Options")',
              'input[value="See All Buying Options"]',
              '#buybox-see-all-buying-choices a',
              '#buybox-see-all-buying-choices button',
          ];

          let clickedSelector = '';
          for (const selector of openers) {
              const opener = page.locator(selector).first();
              if (await opener.count()) {
                  try {
                      await opener.scrollIntoViewIfNeeded();
                      await opener.click({ timeout: 2000 });
                      clickedSelector = selector;
                      logger.info(`[Crawlee] AOD panel opener clicked via: ${selector}`);
                      break;
                  } catch {
                      // Try the next opener candidate.
                  }
              }
          }

          if (!clickedSelector) {
              logger.info('[Crawlee] No AOD panel opener found on page');
              return;
          }

          // Wait for AOD content to render in DOM after click.
          const aodSelectors = '#aod-offer, .aod-offer, #all-offers-display, #aod-offer-list, #aod-container';
          const aodOffers = page.locator(aodSelectors).first();
          try {
              await aodOffers.waitFor({ state: 'attached', timeout: 10000 });
              await page.waitForTimeout(700);
              logger.info('[Crawlee] AOD panel content appeared in DOM');
          } catch {
              logger.warn('[Crawlee] AOD panel did not render within timeout');
          }
      } catch (err: any) {
          logger.warn(`[Crawlee] Failed to expand Other sellers panel: ${err.message}`);
      }
  }

  private async loadAllAmazonOtherSellers(page: any): Promise<void> {
      try {
          const targetOffers = (() => {
              const raw = (process.env.AOD_TARGET_OFFER_ROWS || '').trim().toLowerCase();
              if (!raw || raw === 'all' || raw === 'max') return Number.MAX_SAFE_INTEGER;
              const parsed = Number.parseInt(raw, 10);
              return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.MAX_SAFE_INTEGER;
          })();
          const stats = await page.evaluate(`
              (async () => {
                  const targetRows = ${Number.isFinite(targetOffers) ? targetOffers : Number.MAX_SAFE_INTEGER};
                  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
                  const offerSelector = [
                    '#aod-pinned-offer',
                    '#aod-offer-list > #aod-offer',
                    '#aod-retail-other-offers-content > #aod-offer',
                    '#all-offers-display #aod-offer',
                    '#aod-offer-list > .aod-offer',
                    '#aod-retail-other-offers-content > .aod-offer',
                    '#all-offers-display .aod-offer',
                    '.aod-offer',
                  ].join(', ');
                  const rootCandidates = ['#all-offers-display', '#aod-container', '#aod-offer-list', '#aod-retail-other-offers-content'];
                  const countOffers = () => document.querySelectorAll(offerSelector).length;
                  const parseTotalOfferCount = () => {
                      const totalNode = document.querySelector('#aod-total-offer-count');
                      const raw = (totalNode && totalNode.value) || (totalNode && totalNode.textContent) || '';
                      const parsed = parseInt(String(raw).replace(/[^\\d]/g, ''), 10);
                      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
                  };
                  const targetCount = (() => {
                      const total = parseTotalOfferCount();
                      if (total === null) return targetRows;
                      return Math.min(total, targetRows);
                  })();
                  const isVisible = (el) => {
                      if (!(el instanceof HTMLElement)) return false;
                      const style = window.getComputedStyle(el);
                      return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
                  };
                  const isDisabled = (el) => {
                      if (!(el instanceof HTMLElement)) return false;
                      const ariaDisabled = (el.getAttribute('aria-disabled') || '').toLowerCase() === 'true';
                      const cls = (el.className || '').toLowerCase();
                      return ariaDisabled || cls.includes('disabled') || cls.includes('a-disabled');
                  };
                  const isSafeActionNode = (node) => {
                      const tag = (node.tagName || '').toLowerCase();
                      if (tag !== 'a') return true;
                      const href = String((node.getAttribute && node.getAttribute('href')) || '').trim();
                      const hrefLower = href.toLowerCase();
                      if (!hrefLower || hrefLower === '#' || hrefLower.startsWith('javascript:')) return true;
                      try {
                          const parsed = new URL(href, location.origin);
                          if (parsed.origin !== location.origin) return false;
                          const pathAndQuery = (parsed.pathname + parsed.search).toLowerCase();
                          return /aod|offer-listing|pageno=|experienceid=aodajaxmain/.test(pathAndQuery);
                      } catch {
                          return false;
                      }
                  };
                  const getRoot = () => {
                      for (const selector of rootCandidates) {
                          const node = document.querySelector(selector);
                          if (node && isVisible(node)) return node;
                      }
                      return null;
                  };
                  const scrollRootToBottom = async (root) => {
                      if (!(root instanceof HTMLElement)) return;
                      const scrollables = [root, ...Array.from(root.querySelectorAll('div, section, ol, ul'))]
                        .filter((node) => node instanceof HTMLElement && node.scrollHeight - node.clientHeight > 40)
                        .sort((a, b) => b.scrollHeight - a.scrollHeight);
                      const targets = scrollables.length > 0 ? scrollables.slice(0, 2) : [root];
                      for (const target of targets) {
                          const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
                          if (maxScroll <= 0) continue;
                          const checkpoints = [0.45, 0.72, 0.92, 1];
                          for (const ratio of checkpoints) {
                              target.scrollTop = Math.floor(maxScroll * ratio);
                              target.dispatchEvent(new Event('scroll', { bubbles: true }));
                              await sleep(110);
                          }
                      }
                      window.scrollTo(0, document.body.scrollHeight);
                      await sleep(90);
                  };
                  const signature = () => {
                      const rows = Array.from(document.querySelectorAll(offerSelector)).slice(0, 25);
                      return rows.map((row) => {
                          const id = row.getAttribute('id') || row.getAttribute('data-csa-c-item-id') || '';
                          const text = (row.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
                          return id + '::' + text;
                      }).join('|');
                  };
                  const trySetLowToHigh = async () => {
                      const currentSort = (document.querySelector('#aod-sort-details-string')?.textContent || '').toLowerCase();
                      if (/(price\\s*\\+\\s*delivery).*(low\\s*to\\s*high)|low\\s*to\\s*high/.test(currentSort)) return 'already-low-to-high';
                      const controls = Array.from(document.querySelectorAll('button, div[role="button"], span[role="button"], a[role="button"]'));
                      const sortTrigger = controls.find((node) => {
                          if (!isVisible(node) || isDisabled(node)) return false;
                          const txt = ((node.value || '') + ' ' + (node.innerText || node.textContent || '')).replace(/\\s+/g, ' ').trim().toLowerCase();
                          return /sort|filter/.test(txt);
                      });
                      if (sortTrigger) {
                          sortTrigger.click();
                          await sleep(250);
                      }
                      const options = Array.from(document.querySelectorAll('button, li, [role="option"], div[role="button"], span[role="button"], a[role="button"]'));
                      const lowToHigh = options.find((node) => {
                          if (!isVisible(node) || isDisabled(node)) return false;
                          const txt = ((node.value || '') + ' ' + (node.innerText || node.textContent || '')).replace(/\\s+/g, ' ').trim().toLowerCase();
                          return /(price\\s*\\+\\s*delivery).*(low\\s*to\\s*high)|low\\s*to\\s*high/.test(txt);
                      });
                      if (!lowToHigh) return 'sort-option-not-found';
                      lowToHigh.click();
                      await sleep(900);
                      return 'changed-to-low-to-high';
                  };

                  const initialCount = countOffers();
                  const sortMode = await trySetLowToHigh();
                  let stableTicks = 0;
                  let totalIterations = 0;
                  let clickedControls = 0;
                  let paginationClicks = 0;
                  let prevSignature = signature();

                  while (totalIterations < 120 && stableTicks < 14) {
                      totalIterations += 1;
                      const root = getRoot();
                      if (!root) {
                          await sleep(450);
                          stableTicks += 1;
                          continue;
                      }
                      const beforeCount = countOffers();

                      await scrollRootToBottom(root);
                      await sleep(500);

                      const progressSelector = 'button, input[type="button"], input[type="submit"], div[role="button"], span[role="button"], a[role="button"]';
                      const progressControls = Array.from(new Set([
                          ...Array.from(root.querySelectorAll(progressSelector)),
                          ...Array.from(document.querySelectorAll(progressSelector)),
                      ]));
                      for (const node of progressControls) {
                          if (!isVisible(node) || isDisabled(node)) continue;
                          const href = ((node.getAttribute && node.getAttribute('href')) || '').trim();
                          if (node.tagName?.toLowerCase() === 'a' && !isSafeActionNode(node) && href) continue;
                          const txt = ((node.value || '') + ' ' + (node.innerText || node.textContent || '')).replace(/\\s+/g, ' ').trim().toLowerCase();
                          if (/show more|see more|more offers|more buying choices|load more/.test(txt)) {
                              node.click();
                              clickedControls += 1;
                              await sleep(800);
                              await scrollRootToBottom(root);
                              break;
                          }
                      }

                      const nextNodes = Array.from(new Set(Array.from(document.querySelectorAll(
                          '.a-pagination li.a-last a, .a-pagination li.a-next a, .a-pagination a[aria-label*="next" i], .aod-pagination a[aria-label*="next" i], button[aria-label*="next" i], a[aria-label*="next page" i]'
                      ))));
                      for (const node of nextNodes) {
                          const owner = node.closest('li, button, a');
                          if (!isVisible(node)) continue;
                          if (owner && isDisabled(owner)) continue;
                          const href = ((node.getAttribute && node.getAttribute('href')) || '').trim();
                          if (node.tagName?.toLowerCase() === 'a' && !isSafeActionNode(node) && href) continue;
                          node.click();
                          paginationClicks += 1;
                          await sleep(950);
                          await scrollRootToBottom(root);
                          break;
                      }

                      const afterCount = countOffers();
                      const nextSignature = signature();
                      const changed = afterCount > beforeCount || nextSignature !== prevSignature;
                      prevSignature = nextSignature;
                      if (afterCount >= targetCount) break;
                      stableTicks = changed ? 0 : stableTicks + 1;
                  }

                  return {
                      initialCount,
                      finalCount: countOffers(),
                      targetCount,
                      totalIterations,
                      clickedControls,
                      paginationClicks,
                      sortMode,
                  };
              })();
          `);
          logger.info(
              `[Crawlee] AOD load-all: offers ${stats.initialCount} -> ${stats.finalCount} (target=${stats.targetCount}), iterations=${stats.totalIterations}, clicks=${stats.clickedControls}, pagination=${stats.paginationClicks}, sort=${stats.sortMode}`
          );
      } catch (err: any) {
          logger.warn(`[Crawlee] Failed to load all AOD offers: ${err.message}`);
      }
  }

  /**
   * Try to open the main page quantity dropdown (Amazon custom widget)
   * and extract the max available quantity from the resulting items.
   */
  private async extractMainPageQuantity(page: any): Promise<number | null> {
      try {
          const qtyTrigger = page.locator('#quantity .a-button-text, #quantityDropdownDiv .a-button-text, [aria-label*="quantity" i] .a-button-text').first();
          if (!(await qtyTrigger.count())) return null;

          await qtyTrigger.scrollIntoViewIfNeeded();
          await qtyTrigger.click({ timeout: 1500 });
          await page.waitForTimeout(300);

          const maxQty: number | null = await page.evaluate(() => {
              const candidates: number[] = [];
              document.querySelectorAll('.a-dropdown-item, [role="listbox"] [role="option"], #quantity-dropdown li').forEach((item) => {
                  const parsed = parseInt(((item as HTMLElement).innerText || '').replace(/[^\d]/g, ''), 10);
                  if (Number.isFinite(parsed) && parsed > 0) candidates.push(parsed);
              });
              return candidates.length ? Math.max(...candidates) : null;
          });

          // Close dropdown
          try { await qtyTrigger.click({ timeout: 500 }); } catch { /* ignore */ }

          if (maxQty) {
              logger.info(`[Crawlee] Main page dropdown quantity: ${maxQty}`);
          }
          return maxQty;
      } catch {
          return null;
      }
  }

  async scrapeProduct(url: string): Promise<ProductScrapeResult> {
    try {
      const targetUrl = this.normalizeTargetUrl(url);
      let productResult: Product | undefined;
      let failureReason = '';
      let isBlocked = false;
      let rawHtml = '';
      let screenshotBase64 = '';
      let playwrightMaxQty: number | null = null;

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

      const config = new Configuration({ persistStorage: false });

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
            headless: process.env.NODE_ENV === 'production' ? true : false,
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
          
          // Simulation for lazy loading
          try {
              await page.mouse.move(Math.random() * 500, Math.random() * 500);
              await page.waitForTimeout(500);
              await page.mouse.wheel(0, 600);
              
              const priceSelectors = '#corePrice_feature_div .a-price, #corePriceDisplay_desktop_feature_div .a-price, #priceblock_ourprice, #price_inside_buybox';
              
              let priceFound = false;
              try {
                  await page.waitForSelector(priceSelectors, { state: 'attached', timeout: 3000 });
                  priceFound = true;
              } catch (e) {}

              // Attempt location bypass if no price found right away
              if (!priceFound && request.url.includes('amazon.')) {
                  await this.attemptLocationBypass(page, request.url);
              }

              if (request.url.includes('amazon.')) {
                  await this.forceAmazonUsdCurrency(page, request.url);
                  // Read main page quantity first (quantity dropdown interactions may close AOD panel)
                  playwrightMaxQty = await this.extractMainPageQuantity(page);
                  await this.expandAmazonOtherSellers(page);
                  await this.loadAllAmazonOtherSellers(page);
              }
          } catch (e: any) {
              logger.warn(`[Crawlee] Mouse automation failed. ${e.message}`);
          }

          // Capture AOD data BEFORE scrolling — mouse.wheel() closes the overlay panel
          let domAodOffers: Array<Record<string, any>> = [];
          if (request.url.includes('amazon.')) {
              domAodOffers = await this.extractAodOffersFromDom(page);
              if (domAodOffers.length === 0) {
                  // AOD sometimes closes or renders late; reopen once and retry extraction.
                  await page.waitForTimeout(450);
                  await this.expandAmazonOtherSellers(page);
                  await this.loadAllAmazonOtherSellers(page);
                  await page.waitForTimeout(450);
                  domAodOffers = await this.extractAodOffersFromDom(page);
              }
              logger.info(`[Crawlee] AOD DOM offers extracted: ${domAodOffers.length}`);
              if (domAodOffers.length > 0) {
                  for (const offer of domAodOffers) {
                      logger.info(`[Crawlee]   AOD offer: seller="${offer.sellerName}", price=${offer.price}, stock=${offer.stockCount}`);
                  }
              }

              const remoteAodHtml = await this.fetchAodHtmlFromSession(page, request.url);
              logger.info(`[Crawlee] Remote AOD HTML length: ${remoteAodHtml?.length || 0}`);
              rawHtml = await page.content();
              if (remoteAodHtml && remoteAodHtml.length > 20) {
                  rawHtml = `${rawHtml}\n<div id="__remote_aod_payload">${remoteAodHtml}</div>`;
              }
              if (domAodOffers.length > 0) {
                  const encoded = JSON.stringify(domAodOffers).replace(/</g, '\\u003c');
                  rawHtml = `${rawHtml}\n<script id="__aod_offers_dom" type="application/json">${encoded}</script>`;
              }
              // Inject Playwright-extracted max quantity for Cheerio to consume
              if (playwrightMaxQty !== null && playwrightMaxQty > 0) {
                  rawHtml = `${rawHtml}\n<meta name="playwright-max-qty" content="${playwrightMaxQty}" />`;
              }
          } else {
              rawHtml = await page.content();
          }

          // Scroll after AOD data is captured (scroll would close the overlay)
          try {
              await page.mouse.wheel(0, 600);
              await page.waitForTimeout(800);
              await page.mouse.wheel(0, -1000);
          } catch (e: any) {
              logger.warn(`[Crawlee] Post-AOD scroll failed: ${e.message}`);
          }
          let marketplace = 'unknown';
          if (request.url.includes('amazon')) marketplace = 'amazon';
          else if (request.url.includes('etsy')) marketplace = 'etsy';

          if (this.isBotBlocked(true, rawHtml, request.url)) {
             session?.markBad();
             isBlocked = true;
             throw new Error('Blocked by CAPTCHA/Anti-bot');
          }

          // Always grab a screenshot in case we need it for Phase 3 Multimodal fallback
          try {
             const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 80, fullPage: true });
             screenshotBase64 = screenshotBuffer.toString('base64');
          } catch (e: any) {
             logger.warn(`[Crawlee] Failed to capture fullPage screenshot: ${e.message}`);
          }

          let metrics: Partial<ProductMetrics> = {};
          const scrapedAt = new Date().toISOString();

          // Standard extraction over Cheerio
          const $ = cheerio.load(rawHtml);
          const context = { url: request.url, html: rawHtml, $ };
          const extractor = new PlatformExtractor();
          
          const [metaResult, platformResult] = await Promise.all([
            metadataExtractor.extract(context),
            extractor.extract(context)
          ]);

          let finalTitle = platformResult.title || metaResult.title || 'Unknown Product';
          metrics = { ...metaResult.metrics, ...platformResult.metrics };
          
          // Check cached selectors (Self-Healing Phase 2 prep) - if standard extraction missed price but we have
          // a healed selector in cache, use it immediately!
          if (!metrics.price) {
             const healedPriceSelector = llmSelectorCache.getSelector(request.url, 'price');
             if (healedPriceSelector) {
                 const newPriceText = $(healedPriceSelector).text();
                 if (newPriceText) {
                     const parsed = parseFloat(newPriceText.replace(/[^0-9.,]/g, '').replace(',', '.'));
                     if (!isNaN(parsed) && parsed > 0) {
                         metrics.price = parsed;
                         logger.info(`[Crawlee] Successfully used cached HEALED selector for price!`);
                     }
                 }
             }
          }

          const domainCurrency = detectCurrencyFromDomain(request.url) || 'USD';
          metrics.currency = metrics.currency || domainCurrency;
          metrics = syncMetricsPriceFromBuyBox(metrics, scrapedAt);

          if (metrics.price) {
              metrics.priceUSD = convertToUSD(metrics.price, metrics.currency || 'USD');
              metrics.itemPriceUSD = convertToUSD(metrics.itemPrice || metrics.price, metrics.currency || 'USD');
              
              if (metrics.originalPrice && metrics.originalPrice > metrics.price) {
                  metrics.discountPercentage = Math.round(((metrics.originalPrice - metrics.price) / metrics.originalPrice) * 100);
              }
          }
          
          // Make sure required defaults are filled
          const finalMetrics: ProductMetrics = {
             currency: metrics.currency || domainCurrency,
             description: metrics.description || '',
             imageUrl: metrics.imageUrl || '',
             brand: metrics.brand || '',
             availability: metrics.availability || 'Unknown',
             features: metrics.features || [],
             imageUrls: metrics.imageUrls || [],
             offers: metrics.offers || [],
             ...metrics
          };
          
          productResult = {
            id: uuidv4(),
            title: finalTitle || 'Unknown Product',
            url: request.url,
            marketplace,
            metrics: finalMetrics,
            scrapedAt,
            scrapedBy: 'crawler'
          };
          
          logger.info(`[Crawlee] Pass 1 Extraction for ${productResult.title} - Price: ${metrics.price || 'MISSING'}`);
        },
        failedRequestHandler: async ({ request }: PlaywrightCrawlingContext, error: Error) => {
          logger.error(`[Crawlee] Request failed for ${request.url}: ${error.message}`);
          failureReason = error.message;
          if (proxyString) {
              proxyManager.markAsDead(proxyString);
          }
        },
      }, config);

      await crawler.run([targetUrl]);

      if (isBlocked) {
          return { error: 'Platform blocked the request (CAPTCHA/Robot Check). Proceeding to fallback.' };
      }

      await this.cleanupSnapshots();

      return { 
          product: productResult, 
          html: rawHtml, 
          screenshotBase64,
          error: failureReason ? failureReason : undefined
      };

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

  private isBotBlocked(success: boolean, html: string, url: string = ''): boolean {
    if (!success || !html) return true;
    if (url.includes('etsy.com')) {
        if (html.includes('Pardon Our Interruption') || 
            html.includes('distil_ident_challenge') || 
            html.includes('px-captcha') ||
            html.includes('cloudflare') ||
            html.includes('cf-turnstile') ||
            html.includes('challenges.cloudflare.com')) {
            return true;
        }
        return false;
    }
    return this.isAmazonBlocked(html);
  }

  async scrapeSearch(keyword: string, marketplace: string): Promise<{ result?: SerpResult, error?: string }> {
    try {
      let url = '';
      if (marketplace.includes('amazon')) {
          const tld = marketplace.toLowerCase().replace('amazon.', '') || 'com';
          url = `https://www.amazon.${tld}/s?k=${encodeURIComponent(keyword)}`;
      } else if (marketplace.includes('etsy')) {
          url = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
          
          if (config.firecrawlApiKey && config.etsyForceFirecrawl) {
              logger.info('[CrawleeAdapter] ETSY_FORCE_FIRECRAWL=true, using Firecrawl for Etsy SERP.');
              const FireCrawlApp = require('@mendable/firecrawl-js').default;
              const fc = new FireCrawlApp({ apiKey: config.firecrawlApiKey });
              const res = await fc.scrapeUrl(url, { formats: ['html'], timeout: 60000 });
              if (res.success && res.html) {
                  return { result: extractEtsySerp(res.html, keyword, marketplace) };
              } else {
                  return { error: `Failed to fetch Etsy SERP via Firecrawl. Error: ${res.error}` };
              }
          }
      } else {
          return { error: 'Unsupported marketplace for search' };
      }

      const settings = await storageService.getSettings();
      const strategy = settings.scrapingStrategy || 'hybrid';
      
      let fetchResult: FetchResult | undefined;
      const maxRetries = 3;
      let lastError = '';

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const proxyUrl = await proxyManager.getProxyString();
        
        if (strategy === 'stealth') {
          logger.info(`SERP Mode: stealth. Try ${attempt + 1} for: ${keyword}`);
          fetchResult = await playwrightFetcher.fetchHtml(url, proxyUrl);
        } else {
          logger.info(`SERP Mode: HTTP. Try ${attempt + 1} for: ${keyword}`);
          fetchResult = await fetcher.fetchHtml(url, proxyUrl);

          if (strategy === 'hybrid') {
            const contentStr = fetchResult.html || '';
            if (this.isBotBlocked(fetchResult.success, contentStr, url)) {
              logger.warn(`SERP block detected. Try ${attempt + 1}. Falling back to Playwright...`);
              fetchResult = await playwrightFetcher.fetchHtml(url, proxyUrl);
            }
          }
        }

        const contentStr = fetchResult.html || '';
        if (fetchResult.success && fetchResult.html && !this.isBotBlocked(fetchResult.success, contentStr, url)) {
          break; // Success
        } else {
          lastError = fetchResult.error || (this.isBotBlocked(fetchResult.success, contentStr, url) ? 'Blocked by CAPTCHA/Anti-bot' : 'Unknown Error');
          logger.warn(`SERP attempt ${attempt + 1} failed: ${lastError}`);
          if (proxyUrl) {
            proxyManager.markAsDead(proxyUrl);
          }
        }
      }

      if (!fetchResult || !fetchResult.success || !fetchResult.html) {
          if (config.firecrawlApiKey && lastError.toLowerCase().includes('blocked')) {
              logger.warn(`SERP block detected locally. Falling back to Firecrawl for SERP...`);
              const FireCrawlApp = require('@mendable/firecrawl-js').default;
              const fc = new FireCrawlApp({ apiKey: config.firecrawlApiKey });
              const res = await fc.scrapeUrl(url, { formats: ['html'], timeout: 60000 });
              if (res.success && res.html) {
                  fetchResult = { success: true, html: res.html };
              } else {
                  return { error: `Failed to fetch SERP via Firecrawl. Error: ${res.error}` };
              }
          } else {
              return { error: `Failed to fetch SERP after ${maxRetries} attempts. Last Error: ${lastError}` };
          }
      }

      let serpResult;
      if (marketplace.includes('amazon')) {
          serpResult = extractAmazonSerp(fetchResult.html, keyword, marketplace);
      } else if (marketplace.includes('etsy')) {
          serpResult = extractEtsySerp(fetchResult.html, keyword, marketplace);
      }
      
      return { result: serpResult };

    } catch (err: any) {
      return { error: `SERP Scrape failed: ${err.message}` };
    }
  }
}
