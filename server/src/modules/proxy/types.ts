export interface Proxy {
  host: string;
  port: number;
  protocol: 'http' | 'https' | 'socks4' | 'socks5';
  country?: string;
  username?: string;
  password?: string;
  lastChecked?: number;
  isWorking: boolean;
  
  /**
   * Helper to format the proxy as a connection string
   */
  toString(): string;
}

export interface ProxyProvider {
  /**
   * Initialize the provider (e.g. start background loops)
   */
  initialize?(): Promise<void>;
  shutdown?(): Promise<void>;

  /**
   * Returns a ready-to-use proxy from the pool or null if none are available.
   * @param countryCode Optional 2-letter ISO country code (e.g., 'us', 'de')
   */
  getProxy(countryCode?: string): Promise<Proxy | null>;

  /**
   * Instructs the provider that a proxy failed during use, so it can be evicted from the pool.
   * @param proxyString The proxy identifier (usually host:port or full url)
   */
  markAsDead(proxyString: string): void;
}
