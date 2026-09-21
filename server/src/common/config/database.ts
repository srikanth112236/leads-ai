import mongoose from 'mongoose';
import { createClient } from 'redis';
import { logger } from '../utils/logger';

const DB_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017/leads-crm';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(DB_URL, {
      maxPoolSize: 50,
      minPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('MongoDB connection failed:', error);
    process.exit(1);
  }
}

export async function connectRedis() {
  try {
    const client = createClient({ url: REDIS_URL });
    client.on('error', (err: Error) => logger.error('Redis error:', err));
    await client.connect();
    logger.info('Redis connected successfully');
    return client;
  } catch (error) {
    logger.error('Redis connection failed:', error);
    throw error;
  }
}

export { DB_URL, REDIS_URL };
