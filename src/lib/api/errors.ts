export type GatewayErrorKind =
  | 'network' // device offline, DNS, timeout
  | 'validation' // 4xx with field errors (bad postcode, unknown product, bad promo)
  | 'not_found'
  | 'unauthorized' // guest token missing/expired
  | 'server' // 5xx / unexpected body
  | 'unsupported'; // payments unavailable on this platform

export class GatewayError extends Error {
  readonly kind: GatewayErrorKind;
  readonly status?: number;
  readonly fields?: Record<string, string>;

  constructor(kind: GatewayErrorKind, message: string, opts?: { status?: number; fields?: Record<string, string> }) {
    super(message);
    this.name = 'GatewayError';
    this.kind = kind;
    this.status = opts?.status;
    this.fields = opts?.fields;
  }
}

export const isGatewayError = (e: unknown): e is GatewayError => e instanceof GatewayError;
