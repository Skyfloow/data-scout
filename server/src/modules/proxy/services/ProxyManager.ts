import { Proxy, ProxyProvider } from '../types';
import { FreeProxyProvider } from '../providers/FreeProxyProvider';
import { storageService } from '../../storage/services/StorageService';
import { logger as baseLogger } from '../../../utils/logger';

const logger = baseLogger.child({ module: 'ProxyManager' });

export class ProxyManagerService {
  private activeProvider: ProxyProvider | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    try {
      await this.shutdown();
      const settings = await storageService.getSettings();
      const proxyMode = settings.proxyMode || 'direct';

      if (proxyMode === 'free') {
        logger.info('Initializing ProxyManager with FreeProxyProvider');
        this.activeProvider = new FreeProxyProvider();
        if (this.activeProvider?.initialize) {
          await this.activeProvider.initialize();
        }
      } else if (proxyMode === 'paid') {
        logger.warn('Paid Proxy Provider not implemented yet. Using direct connection.');
        this.activeProvider = null;
      } else {
        logger.info('ProxyManager initialized in direct mode (no proxy).');
        this.activeProvider = null;
      }
      this.initialized = true;
    } catch (err) {
      logger.error(err, 'Failed to initialize ProxyManager');
    }
  }

  async shutdown(): Promise<void> {
    if (this.activeProvider?.shutdown) {
      await this.activeProvider.shutdown();
    }
    this.activeProvider = null;
    this.initialized = false;
  }

  async getProxy(countryCode?: string): Promise<Proxy | null> {
    if (!this.initialized || !this.activeProvider) {
      return null;
    }
    return this.activeProvider.getProxy(countryCode);
  }

  markAsDead(proxyString: string): void {
    if (this.activeProvider) {
      this.activeProvider.markAsDead(proxyString);
    }
  }

  async getProxyString(countryCode?: string): Promise<string | undefined> {
    const proxy = await this.getProxy(countryCode);
    if (!proxy) {
      return undefined;
    }

    if (proxy.toString) {
        return proxy.toString();
    }

    // Fallback if toString is not implemented
    let proxyStr = `${proxy.protocol}://`;
    if (proxy.username && proxy.password) {
      proxyStr += `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`;
    }
    proxyStr += `${proxy.host}:${proxy.port}`;
    return proxyStr;
  }
}

export const proxyManager = new ProxyManagerService();
