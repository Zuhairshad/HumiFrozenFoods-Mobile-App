const REDACTED = '[REDACTED]';

/**
 * Wraps a sensitive string so that logging, JSON serialisation, string
 * interpolation and util.inspect all yield "[REDACTED]". The only way to read
 * the value is the explicit, greppable `reveal()`.
 */
export class Secret {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return REDACTED;
  }
}
