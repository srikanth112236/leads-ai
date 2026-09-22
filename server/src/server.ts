import 'dotenv/config';
import { app } from './app';
import { connectDB } from './common/config/database';
import { startQueueWorkers } from './modules/queue/queue.config';
import { logger } from './common/utils/logger';

const PORT = process.env.PORT || 3000;

async function main() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
    });
    startQueueWorkers().catch((error) => {
      logger.error('Queue workers failed to start (webhooks still persist events for later retry):', error);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
