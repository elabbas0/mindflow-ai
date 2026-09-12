export class AppError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

export class NotConfiguredError extends AppError {
  constructor(service: string) {
    super(`${service} is not configured. Set the required env vars (see .env.example).`, 503);
    this.name = 'NotConfiguredError';
  }
}
