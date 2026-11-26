/** Errors never carry credentials in their messages. */
export class BerthError extends Error {
  override name = "BerthError";
}

export class NotFoundError extends BerthError {
  override name = "NotFoundError";
}

export class UnsupportedError extends BerthError {
  override name = "UnsupportedError";
}

export class LimitExceededError extends BerthError {
  override name = "LimitExceededError";
}

export class ProviderError extends BerthError {
  override name = "ProviderError";
  readonly providerId: string;
  constructor(
    providerId: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.providerId = providerId;
  }
}
