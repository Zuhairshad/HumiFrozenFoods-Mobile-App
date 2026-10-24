import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';

/** Keys redacted wherever they appear within three levels of nesting. */
const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'token',
  'accessToken',
  'guestToken',
  'secret',
  'apiKey',
  'x-api-key',
  'stripe-signature',
  'email',
  'phone',
  'phoneNumber',
  'cardNumber',
  'card',
  'cvc',
  'cvv',
  'expiry',
  'clientSecret',
  'address',
  'postcode',
] as const;

function bracket(key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : `["${key}"]`;
}

export function buildRedactPaths(): string[] {
  const prefixes = ['', '*.', '*.*.', '*.*.*.'];
  return SENSITIVE_KEYS.flatMap((key) => prefixes.map((p) => `${p}${bracket(key)}`));
}

export interface LoggerConfig {
  level: string;
  pretty?: boolean;
  destination?: DestinationStream;
}

export function createLogger(config: LoggerConfig): Logger {
  const options: LoggerOptions = {
    level: config.level,
    base: { service: 'humis-api' },
    redact: { paths: buildRedactPaths(), censor: '[REDACTED]' },
    serializers: { err: pino.stdSerializers.err },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  if (config.pretty && !config.destination) {
    return pino({ ...options, transport: { target: 'pino-pretty' } });
  }
  return config.destination ? pino(options, config.destination) : pino(options);
}
