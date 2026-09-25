import { Queue, Worker } from 'bullmq';
import { logger } from '../../common/utils/logger';

// NOTE: BullMQ manages its own ioredis connection internally.
// We pass a URL options object (cast to any to avoid ioredis/node-redis type friction).
// Pending: add explicit `ioredis` dep and switch to a shared IORedis instance.
function queueConnection(): any {
  return { url: process.env.REDIS_URL || 'redis://localhost:6379' };
}

let metaQueue: Queue | null = null;
let whatsappQueue: Queue | null = null;
let processingQueue: Queue | null = null;
let notificationQueue: Queue | null = null;
let metaSyncQueue: Queue | null = null;
let metaHealthQueue: Queue | null = null;

export async function getMetaQueue(): Promise<Queue> {
  if (!metaQueue) {
    metaQueue = new Queue('meta-leads', { connection: queueConnection() });
  }
  return metaQueue;
}

export async function getWhatsAppQueue(): Promise<Queue> {
  if (!whatsappQueue) {
    whatsappQueue = new Queue('whatsapp-messages', { connection: queueConnection() });
  }
  return whatsappQueue;
}

export async function getProcessingQueue(): Promise<Queue> {
  if (!processingQueue) {
    processingQueue = new Queue('lead-processing', { connection: queueConnection() });
  }
  return processingQueue;
}

export async function getNotificationQueue(): Promise<Queue> {
  if (!notificationQueue) {
    notificationQueue = new Queue('notifications', { connection: queueConnection() });
  }
  return notificationQueue;
}

export async function getMetaSyncQueue(): Promise<Queue> {
  if (!metaSyncQueue) {
    metaSyncQueue = new Queue('meta-sync', { connection: queueConnection() });
  }
  return metaSyncQueue;
}

export function metaSyncSchedulerId(companyId: string): string {
  return `meta-sync-${companyId}`;
}

export async function getMetaHealthQueue(): Promise<Queue> {
  if (!metaHealthQueue) {
    metaHealthQueue = new Queue('meta-health', { connection: queueConnection() });
  }
  return metaHealthQueue;
}

export const META_HEALTH_SCHEDULER_ID = 'meta-health-check';

// Idempotent 6-hour token-validation loop (safe to call on every boot).
export async function scheduleMetaHealthCheck(intervalMs = 6 * 60 * 60 * 1000): Promise<void> {
  const queue = await getMetaHealthQueue();
  await addWithTimeout(() =>
    queue.upsertJobScheduler(META_HEALTH_SCHEDULER_ID, { every: intervalMs }, { data: {} }),
  );
}

// (Re)schedules the per-company Meta pull. Upsert is idempotent: changing the
// interval replaces the old schedule. Bounded by timeout so API responses never
// hang when Redis is unreachable (the setting is still persisted in Mongo).
export async function scheduleMetaSync(companyId: string, intervalMinutes: number): Promise<void> {
  const queue = await getMetaSyncQueue();
  await addWithTimeout(() =>
    queue.upsertJobScheduler(metaSyncSchedulerId(companyId), { every: intervalMinutes * 60 * 1000 }, { data: { companyId } }),
  );
}

export async function removeMetaSync(companyId: string): Promise<void> {
  const queue = await getMetaSyncQueue();
  await addWithTimeout(() => queue.removeJobScheduler(metaSyncSchedulerId(companyId)));
}

// Webhooks must return fast even if Redis is down: bound every enqueue with a
// timeout. The event row stays `pending` in Mongo and is picked up later.
const ENQUEUE_TIMEOUT_MS = 2500;

async function addWithTimeout(add: () => Promise<unknown>): Promise<void> {
  await Promise.race([
    add(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('queue enqueue timed out')), ENQUEUE_TIMEOUT_MS),
    ),
  ]);
}

export async function addMetaLeadJob(data: Record<string, unknown>): Promise<void> {
  const queue = await getMetaQueue();
  await addWithTimeout(() =>
    queue.add('process-meta-lead', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      jobId: (data.webhookEventId as string) || undefined,
    }),
  );
}

export async function addWhatsAppJob(data: Record<string, unknown>): Promise<void> {
  const queue = await getWhatsAppQueue();
  await addWithTimeout(() =>
    queue.add('process-whatsapp', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      jobId: (data.webhookEventId as string) || undefined,
    }),
  );
}

export async function addProcessingJob(data: Record<string, unknown>): Promise<void> {
  const queue = await getProcessingQueue();
  await addWithTimeout(() =>
    queue.add('validate-enrich-score', data, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }),
  );
}

export async function addNotificationJob(data: Record<string, unknown>): Promise<void> {
  const queue = await getNotificationQueue();
  await addWithTimeout(() =>
    queue.add('send-notification', data, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }),
  );
}

export async function startQueueWorkers(): Promise<void> {
  try {
    // Lazy import avoids a static cycle (queue.service imports the add*Job helpers above).
    const { QueueService } = await import('./queue.service');
    const metaWorker = new Worker('meta-leads', async (job) => {
      logger.info('Processing meta lead job', { jobId: job?.id });
      await QueueService.processWebhookJob('meta', (job?.data as any)?.webhookEventId);
    }, { connection: queueConnection() });
    metaWorker.on('completed', (job) => logger.info('Meta lead job completed', { jobId: job?.id }));
    metaWorker.on('failed', (job, err) => logger.error('Meta lead job failed', { jobId: job?.id, err: err.message }));

    const whatsappWorker = new Worker('whatsapp-messages', async (job) => {
      logger.info('Processing WhatsApp job', { jobId: job?.id });
      const { QueueService } = await import('./queue.service');
      await QueueService.processWebhookJob('whatsapp', (job?.data as any)?.webhookEventId);
    }, { connection: queueConnection() });
    whatsappWorker.on('completed', (job) => logger.info('WhatsApp job completed', { jobId: job?.id }));
    whatsappWorker.on('failed', (job, err) => logger.error('WhatsApp job failed', { jobId: job?.id, err: err.message }));

    const notificationWorker = new Worker('notifications', async (job) => {
      const { NotificationService } = await import('../notification/notification.service');
      await NotificationService.dispatch((job?.data as any) || {});
    }, { connection: queueConnection() });
    notificationWorker.on('completed', (job) => logger.info('Notification job completed', { jobId: job?.id }));
    notificationWorker.on('failed', (job, err) => logger.error('Notification job failed', { jobId: job?.id, err: err.message }));

    const syncWorker = new Worker('meta-sync', async (job) => {
      const { MetaService } = await import('../meta/meta.service');
      const { MetaSyncSetting } = await import('../../common/models/MetaSyncSetting');
      const companyId = (job?.data as any)?.companyId as string;
      try {
        const result = await MetaService.syncAdAccounts(companyId);
        await MetaSyncSetting.findOneAndUpdate(
          { companyId },
          { lastRunAt: new Date(), lastResult: `synced ${result.synced} accounts` },
          { upsert: true },
        );
        logger.info('Meta scheduled sync complete', { companyId, ...result });
      } catch (error: any) {
        await MetaSyncSetting.findOneAndUpdate(
          { companyId },
          { lastRunAt: new Date(), lastResult: `failed: ${error.message}` },
          { upsert: true },
        );
        logger.error('Meta scheduled sync failed', { companyId, error: error.message });
        throw error;
      }
    }, { connection: queueConnection() });
    syncWorker.on('failed', (job, err) => logger.error('Meta sync job failed', { jobId: job?.id, err: err.message }));

    const healthWorker = new Worker('meta-health', async () => {
      const { MetaHealthService } = await import('../meta/meta-health.service');
      await MetaHealthService.runHealthCheck();
    }, { connection: queueConnection() });
    healthWorker.on('failed', (job, err) => logger.error('Meta health job failed', { jobId: job?.id, err: err.message }));

    // Ensure the periodic token-validation loop is scheduled (idempotent).
    try {
      await scheduleMetaHealthCheck();
    } catch (scheduleError: any) {
      logger.warn('Meta health scheduler not armed (Redis unreachable?)', { error: scheduleError?.message });
    }

    logger.info('Queue workers started');
  } catch (error) {
    logger.error('Failed to start queue workers:', error);
  }
}
