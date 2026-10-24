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

function pathFor(prefix: string, key: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return `${prefix}${key}`;
  // Keys such as "set-cookie" need bracket notation, which attaches without a dot.
  return `${prefix.replace(/\.$/, '')}["${key}"]`;
}

export function buildRedactPaths(): string[] {
  const prefixes = ['', '*.', '*.*.', '*.*.*.'];
  return SENSITIVE_KEYS.flatMap((key) => prefixes.map((p) => pathFor(p, key)));
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
