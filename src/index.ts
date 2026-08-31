export { DiscordGateway } from './gateway/discord-gateway';
import type { Env, OrbitJob } from './types';
import { routeRequest } from './router';
import { handleQueue, scheduledSweep } from './modules/scheduler/jobs';

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return routeRequest(request, env);
  },
  queue(batch: MessageBatch<OrbitJob>, env: Env): Promise<void> {
    return handleQueue(batch, env);
  },
  scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    return scheduledSweep(env);
  },
};
