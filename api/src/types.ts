import type { Logger } from 'pino';

export interface AppVariables {
  requestId: string;
  logger: Logger;
  clientIp: string;
}

export interface AppEnv {
  Variables: AppVariables;
}
