import { Proxy, ProxyProvider } from '../types';
import pino from 'pino';

const logger = pino({ name: 'FreeProxyProvider' });

export class FreeProxyProvider implements ProxyProvider {
  private activeProxies: Proxy[] = [];
  private isFetching: boolean = false;
  private fetchInterval: NodeJS.Timeout | null = null;
  private readonly MIN_PROXIES = 10;
  private readonly REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  async initialize(): Promise<void> {
    logger.info('Initializing FreeProxyProvider...');
    if (this.fetchInterval) {
      clearInterval(this.fetchInterval);
      this.fetchInterval = null;
    }
    await this.fetchAndValidateProxies();
    
    this.fetchInterval = setInterval(() => {
      this.fetchAndValidateProxies().catch(err => logger.error('Failed to run periodic proxy fetch', err));
    }, this.REFRESH_INTERVAL_MS);
  }

  async shutdown(): Promise<void> {
    if (this.fetchInterval) {
      clearInterval(this.fetchInterval);
      this.fetchInterval = null;
    }
    this.activeProxies = [];
    this.isFetching = false;
    logger.info('FreeProxyProvider stopped.');
  }

  async getProxy(countryCode?: string): Promise<Proxy | null> {
    let pool = this.activeProxies;
    
    if (countryCode) {
        const cc = countryCode.toLowerCase();
        pool = this.activeProxies.filter(p => p.country === cc);
        if (pool.length === 0) {
            if (!this.isFetching) {
                await this.fetchAndValidateProxies(cc);
                pool = this.activeProxies.filter(p => p.country === cc);
            }
        }
    }

    if (pool.length === 0) {
      if (!this.isFetching) {
        this.fetchAndValidateProxies(countryCode).catch(() => {});
      }
      return null;
    }

    // Return a random proxy from the active pool to distribute load
    const randomIndex = Math.floor(Math.random() * pool.length);
    return pool[randomIndex];
  }

  markAsDead(proxyString: string): void {
    const initialCount = this.activeProxies.length;
    this.activeProxies = this.activeProxies.filter(p => {
      // Build a matching string depending on format
      const matchString1 = `${p.host}:${p.port}`;
      const matchString2 = `${p.protocol}://${p.host}:${p.port}`;
      return proxyString !== matchString1 && proxyString !== matchString2;
    });

    if (this.activeProxies.length < initialCount) {
      logger.warn(`Marked proxy as dead: ${proxyString}. Remaining pool size: ${this.activeProxies.length}`);
    }

    if (this.activeProxies.length < this.MIN_PROXIES && !this.isFetching) {
      logger.info('Pool size below threshold, triggering background fetch...');
      this.fetchAndValidateProxies().catch(() => {});
    }
  }

  private async fetchAndValidateProxies(countryCode?: string): Promise<void> {
    if (this.isFetching) return;
    this.isFetching = true;

    try {
      const cCode = countryCode ? countryCode.toLowerCase() : 'all';
      logger.info(`Fetching fresh free proxies list for country: ${cCode}...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for the list fetch
      
      // Simple raw text list from proxyscrape API for http proxies (must be elite/anonymous to hide real IP)
      const response = await fetch(`https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=${cCode}&ssl=all&anonymity=elite,anonymous`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch proxy list: ${response.status} ${response.statusText}`);
      }
      
      const text = await response.text();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      const parsedProxies: Proxy[] = lines.map(line => {
        const [host, portStr] = line.split(':');
        const port = parseInt(portStr, 10);
        const protocol = 'http';
        return {
          host,
          port,
          protocol,
          country: cCode !== 'all' ? cCode : undefined,
          isWorking: false,
          toString() {
             return `${protocol}://${host}:${port}`;
          }
        };
      });

      logger.info(`Fetched ${parsedProxies.length} proxies. Validating up to 50 random proxies...`);
      
      // Shuffle to get a random subset to validate
      const toValidate = parsedProxies.sort(() => 0.5 - Math.random()).slice(0, 50);
      
      // Validate concurrently
      const validationPromises = toValidate.map(p => this.validateProxy(p));
      const results = await Promise.allSettled(validationPromises);
      
      const validProxies: Proxy[] = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          validProxies.push({ ...toValidate[index], isWorking: true, lastChecked: Date.now() });
        }
      });

      logger.info(`Validation complete. Found ${validProxies.length} valid proxies out of ${toValidate.length}.`);
      
      // Merge with active pool, avoiding duplicates
      const existingHosts = new Set(this.activeProxies.map(p => p.host));
      const newProxies = validProxies.filter(p => !existingHosts.has(p.host));
      
      this.activeProxies = [...this.activeProxies, ...newProxies];
      logger.info(`Updated active proxy pool. Total size: ${this.activeProxies.length}`);
    } catch (error) {
      logger.error(error, 'Error fetching and validating proxies');
    } finally {
      this.isFetching = false;
    }
  }

  private async validateProxy(proxy: Proxy): Promise<boolean> {
    try {
      const proxyStr = `http://${proxy.host}:${proxy.port}`;
      // In Node 18+, fetch doesn't natively support proxies without an agent like undici's ProxyAgent
      // For this MVP, we'll try a fast socket connection, but we add a strict timeout.
      // A better long-term solution is to use undici.ProxyAgent to make a real HTTP request 
      // to a target like https://api.ipify.org?format=json or http://httpbin.org/ip
      
      return await new Promise<boolean>((resolve) => {
        const net = require('net');
        const socket = new net.Socket();
        
        socket.setTimeout(2500); // Strict 2.5s timeout for validation
        
        socket.on('connect', () => {
          socket.destroy();
          resolve(true); // Port is open and reachable
        });
        
        socket.on('timeout', () => {
          socket.destroy();
          resolve(false);
        });
        
        socket.on('error', () => {
          socket.destroy();
          resolve(false);
        });
        
        socket.connect(proxy.port, proxy.host);
      });
    } catch (err) {
      return false;
    }
  }
}
