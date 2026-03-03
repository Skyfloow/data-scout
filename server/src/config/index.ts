import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const dataDir = process.env.DATA_DIR || './data';
const apiKeys = (process.env.API_KEYS || process.env.API_KEY || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  dataDir,
  dataDirPath: path.resolve(process.cwd(), dataDir),
  firecrawlApiKey: process.env.FIRECRAWL_API_KEY || '',
  corsOrigins,
  apiKeys,
  authEnabled: apiKeys.length > 0,
  swaggerEnabled: parseBoolean(process.env.ENABLE_SWAGGER, (process.env.NODE_ENV || 'development') !== 'production'),
  jobRetentionMs: parseNumber(process.env.JOB_RETENTION_MS, 24 * 60 * 60 * 1000),
  maxJobs: parseNumber(process.env.MAX_JOBS, 10000),
};
