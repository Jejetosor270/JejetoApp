export class PaymentNotFoundError extends Error {
  constructor(message = "The payment record no longer exists.") {
    super(message);
    this.name = "PaymentNotFoundError";
  }
}

export class PaymentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentValidationError";
  }
}

export function isExpectedPaymentError(error: unknown): error is Error {
  return (
    error instanceof PaymentNotFoundError ||
    error instanceof PaymentValidationError
  );
}
