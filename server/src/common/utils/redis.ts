import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

let redisClient: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
  if (!redisClient) {
    redisClient = await createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
    redisClient.on('error', (err) => logger.error('Redis error:', err));
    await redisClient.connect();
    logger.info('Redis connected');
  }
  return redisClient;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const client = await getRedisClient();
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error('Cache get error:', error);
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds = 3600): Promise<void> {
  try {
    const client = await getRedisClient();
    await client.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    logger.error('Cache set error:', error);
  }
}

export async function cacheDelete(key: string): Promise<void> {
  try {
    const client = await getRedisClient();
    await client.del(key);
  } catch (error) {
    logger.error('Cache delete error:', error);
  }
}
