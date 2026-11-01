/** The subset of queue options used by ActorConsole, supported by both backends. */
export interface QueueJobOptions {
  jobId?: string;
  attempts?: number;
  delay?: number;
  lifo?: boolean;
  deduplication?: { id: string };
  backoff?: number | { type: "fixed" | "exponential"; delay: number };
  removeOnComplete?: boolean | number | QueueJobRetention;
  removeOnFail?: boolean | number | QueueJobRetention;
}

export type QueueJobRetention = { count: number; age?: number } | { age: number; count?: number };

export interface QueueJob<T = any> {
  id?: string;
  name: string;
  data: T;
  opts: Pick<QueueJobOptions, "attempts">;
  attemptsMade: number;
  progress: number | string | boolean | object;
  returnvalue: any;
  failedReason: string;
  getState(): Promise<string>;
  updateProgress(progress: number | object): Promise<void>;
}
