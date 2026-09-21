import mongoose from 'mongoose';

const TEST_DB = process.env.TEST_DATABASE_URL || 'mongodb://localhost:27017/leads-crm-test';

export async function connectTestDB(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_DB);
  }
}

export async function clearTestDB(): Promise<void> {
  const collections = mongoose.connection.collections;
  for (const name of Object.keys(collections)) {
    await collections[name].deleteMany({});
  }
}

export async function closeTestDB(): Promise<void> {
  await mongoose.connection.close();
}
