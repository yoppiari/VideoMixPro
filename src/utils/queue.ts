import Bull from 'bull';
import { EventEmitter } from 'events';

// Type definitions for job data
interface JobData {
  [key: string]: any;
}

interface JobOptions {
  delay?: number;
  attempts?: number;
  backoff?: number | { type: string; delay: number };
  removeOnComplete?: boolean;
  removeOnFail?: boolean;
}

// In-memory queue implementation for development
class InMemoryQueue extends EventEmitter {
  private jobs: Map<string, any> = new Map();
  private processing: boolean = false;
  private jobCounter: number = 0;
  private queueName: string;
  private processor: ((job: any) => Promise<any>) | null = null;

  constructor(queueName: string) {
    super();
    this.queueName = queueName;
    console.log(`📦 In-memory queue created: ${queueName}`);
  }

  async add(data: JobData, options?: JobOptions): Promise<any> {
    const jobId = `${this.queueName}-${++this.jobCounter}`;
    const job = {
      id: jobId,
      data,
      opts: options || {},
      createdAt: new Date(),
      status: 'waiting',
      attemptsMade: 0,
      progress: 0
    };

    this.jobs.set(jobId, job);
    console.log(`📝 Job added to memory queue: ${jobId}`);

    // Emit event
    this.emit('waiting', job);

    // Process if delay is not set
    if (!options?.delay) {
      setImmediate(() => this.processNext());
    } else {
      setTimeout(() => this.processNext(), options.delay);
    }

    return job;
  }

  process(concurrency: number | ((job: any) => Promise<any>), processor?: (job: any) => Promise<any>): void {
    if (typeof concurrency === 'function') {
      this.processor = concurrency;
    } else {
      this.processor = processor || null;
    }

    console.log(`🔄 Queue processor registered for: ${this.queueName}`);
    this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.processing || !this.processor) return;

    const waitingJobs = Array.from(this.jobs.values())
      .filter(job => job.status === 'waiting');

    if (waitingJobs.length === 0) return;

    this.processing = true;
    const job = waitingJobs[0];

    try {
      job.status = 'active';
      this.emit('active', job);
      console.log(`⚡ Processing job: ${job.id}`);

      const result = await this.processor({
        ...job,
        progress: (progress: number) => {
          job.progress = progress;
          this.emit('progress', job, progress);
        }
      });

      job.status = 'completed';
      job.finishedAt = new Date();
      job.result = result;

      this.emit('completed', job, result);
      console.log(`✅ Job completed: ${job.id}`);

      // Remove if configured
      if (job.opts.removeOnComplete) {
        this.jobs.delete(job.id);
      }
    } catch (error) {
      job.status = 'failed';
      job.failedReason = error;
      job.finishedAt = new Date();
      job.attemptsMade++;

      this.emit('failed', job, error);
      console.error(`❌ Job failed: ${job.id}`, error);

      // Retry logic
      if (job.opts.attempts && job.attemptsMade < job.opts.attempts) {
        job.status = 'waiting';
        const backoffDelay = typeof job.opts.backoff === 'number'
          ? job.opts.backoff * job.attemptsMade
          : 1000 * job.attemptsMade;

        setTimeout(() => this.processNext(), backoffDelay);
      } else if (job.opts.removeOnFail) {
        this.jobs.delete(job.id);
      }
    } finally {
      this.processing = false;
      // Process next job
      setImmediate(() => this.processNext());
    }
  }

  async getJob(jobId: string): Promise<any> {
    return this.jobs.get(jobId);
  }

  async getJobs(types: string[]): Promise<any[]> {
    return Array.from(this.jobs.values())
      .filter(job => types.includes(job.status));
  }

  async empty(): Promise<void> {
    this.jobs.clear();
    console.log(`🗑️ Queue emptied: ${this.queueName}`);
  }

  async close(): Promise<void> {
    this.removeAllListeners();
    this.jobs.clear();
    console.log(`🔒 Queue closed: ${this.queueName}`);
  }

  async getJobCounts(): Promise<{ waiting: number; active: number; completed: number; failed: number }> {
    const jobs = Array.from(this.jobs.values());
    return {
      waiting: jobs.filter(j => j.status === 'waiting').length,
      active: jobs.filter(j => j.status === 'active').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length
    };
  }
}

// Queue Manager for auto-switching between Redis and In-Memory
class QueueAdapter {
  private queues: Map<string, Bull.Queue | InMemoryQueue> = new Map();
  private useInMemory: boolean;
  private redisUrl: string;

  constructor() {
    this.useInMemory = process.env.NODE_ENV === 'development' && process.env.USE_IN_MEMORY_QUEUE === 'true';
    this.redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    console.log(`🎯 Queue adapter initialized: ${this.useInMemory ? 'In-Memory' : 'Redis'} mode`);
  }

  createQueue(queueName: string, options?: Bull.QueueOptions): Bull.Queue | InMemoryQueue {
    // Check if queue already exists
    if (this.queues.has(queueName)) {
      return this.queues.get(queueName)!;
    }

    let queue: Bull.Queue | InMemoryQueue;

    if (this.useInMemory) {
      // Use in-memory queue for development
      queue = new InMemoryQueue(queueName);
    } else {
      // Use Bull/Redis for production
      try {
        queue = new Bull(queueName, this.redisUrl, options);
        console.log(`🔴 Redis queue created: ${queueName}`);
      } catch (error) {
        console.warn(`⚠️ Redis connection failed, falling back to in-memory queue`);
        queue = new InMemoryQueue(queueName);
        this.useInMemory = true;
      }
    }

    this.queues.set(queueName, queue);
    return queue;
  }

  getQueue(queueName: string): Bull.Queue | InMemoryQueue | undefined {
    return this.queues.get(queueName);
  }

  async closeAll(): Promise<void> {
    for (const [name, queue] of this.queues) {
      await queue.close();
      console.log(`Queue closed: ${name}`);
    }
    this.queues.clear();
  }

  isUsingInMemory(): boolean {
    return this.useInMemory;
  }
}

// Export singleton instance
export const queueAdapter = new QueueAdapter();

// Export default queue names
export const QueueNames = {
  VIDEO_PROCESSING: 'video-processing',
  THUMBNAIL_GENERATION: 'thumbnail-generation',
  NOTIFICATION: 'notification',
  CLEANUP: 'cleanup'
} as const;

// Export helper function to create queues
export function createQueue(name: string, options?: Bull.QueueOptions): Bull.Queue | InMemoryQueue {
  return queueAdapter.createQueue(name, options);
}

// Export Bull for type compatibility
export { Bull };