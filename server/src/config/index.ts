import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

let envPath = path.resolve(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  const rootEnvPath = path.resolve(process.cwd(), '../.env');
  if (fs.existsSync(rootEnvPath)) {
    envPath = rootEnvPath;
  }
}
dotenv.config({ path: envPath });

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseArray = (value: string | undefined): string[] => {
  if (!value) return [];
  return value.split(',').map((v) => v.trim()).filter(Boolean);
};

export interface AppConfig {
  port: number;
  host: string;
  nodeEnv: string;
  dataDir: string;
  dataDirPath: string;
  firecrawlApiKey: string;
  geminiApiKey: string;
  corsOrigins: string[];
  apiKeys: string[];
  authEnabled: boolean;
  swaggerEnabled: boolean;
  jobRetentionMs: number;
  maxJobs: number;
  etsyForceFirecrawl: boolean;
  humanDelayMinMs: number;
  humanDelayMaxMs: number;
}

function loadConfig(): AppConfig {
  const dataDir = process.env.DATA_DIR || './data';
  const apiKeys = parseArray(process.env.API_KEYS || process.env.API_KEY);
  const corsOrigins = parseArray(process.env.CORS_ORIGINS);
  
  const config: AppConfig = {
    port: parseNumber(process.env.PORT, 3000),
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    dataDir,
    dataDirPath: path.resolve(process.cwd(), dataDir),
    firecrawlApiKey: process.env.FIRECRAWL_API_KEY || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    corsOrigins,
    apiKeys,
    authEnabled: apiKeys.length > 0,
    swaggerEnabled: parseBoolean(process.env.ENABLE_SWAGGER, (process.env.NODE_ENV || 'development') !== 'production'),
    jobRetentionMs: parseNumber(process.env.JOB_RETENTION_MS, 24 * 60 * 60 * 1000),
    maxJobs: parseNumber(process.env.MAX_JOBS, 10000),
    etsyForceFirecrawl: parseBoolean(process.env.ETSY_FORCE_FIRECRAWL, false),
    humanDelayMinMs: parseNumber(process.env.HUMAN_DELAY_MIN_MS, 400),
    humanDelayMaxMs: parseNumber(process.env.HUMAN_DELAY_MAX_MS, 1200),
  };

  validateConfig(config);

  return config;
}

function validateConfig(config: AppConfig) {
  const errors: string[] = [];

  if (config.port <= 0 || config.port > 65535) {
    errors.push(`Invalid PORT: ${config.port}`);
  }
  
  if (config.humanDelayMinMs > config.humanDelayMaxMs) {
    errors.push(`HUMAN_DELAY_MIN_MS (${config.humanDelayMinMs}) cannot be greater than HUMAN_DELAY_MAX_MS (${config.humanDelayMaxMs})`);
  }

  if (errors.length > 0) {
    console.error('Environment configuration failed validation:');
    errors.forEach(e => console.error(`- ${e}`));
    process.exit(1);
  }
}

export const config = loadConfig();
