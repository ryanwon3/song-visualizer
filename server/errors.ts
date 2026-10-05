/**
 * An error whose message is safe and useful to show the person who pasted the
 * link. Anything else is logged and reported as a generic failure.
 */
export class UserError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "UserError";
    this.status = status;
  }
}
