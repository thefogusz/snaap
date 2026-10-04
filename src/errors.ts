/** Public API failures. Routes share this module without importing the server. */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
