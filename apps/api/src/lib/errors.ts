/**
 * Custom error class for authentication failures.
 * Thrown when a user fails to authenticate or has invalid credentials.
 */
export class AuthError extends Error {
  override readonly name = "AuthError" as const;

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

/**
 * Custom error class for insufficient balance conditions.
 * Thrown when a user attempts an operation requiring more funds than available.
 */
export class InsufficientBalanceError extends Error {
  override readonly name = "InsufficientBalanceError" as const;

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, InsufficientBalanceError.prototype);
  }
}

/**
 * Custom error class for invalid request payloads.
 * Thrown when request validation fails or required parameters are missing.
 */
export class InvalidRequestError extends Error {
  override readonly name = "InvalidRequestError" as const;

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, InvalidRequestError.prototype);
  }
}
