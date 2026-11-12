import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@actorconsole/shared', () => ({ retryPolicyFor: () => ({ attempts: 3 }) }));
import { enqueue } from '../../src/lib/queue.js';
describe('untouched baseline queue acknowledgement', () => {
 afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); global.__redis=undefined; global.__queues=undefined; });
 it('audit fixture: a rejected enqueue must not later be accepted for execution', async () => {
  vi.useFakeTimers(); vi.stubEnv('REDIS_URL','redis://127.0.0.1:6379/15');
  let accepted=false;
  const add=vi.fn(() => new Promise(resolve => setTimeout(() => { accepted=true; resolve({id:'job_fixture'}); },1600)));
  global.__redis={} as never;
  global.__queues=new Map([['schedules',{add} as never]]);
  const pending=enqueue('schedules',{bulkPublishScheduleId:'schedule_1'}).catch(error=>error);
  await vi.waitFor(()=>expect(add).toHaveBeenCalledOnce());
  await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({message:'Redis command timed out'});
  expect(accepted).toBe(false);
 });
});
