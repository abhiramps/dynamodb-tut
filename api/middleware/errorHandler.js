/**
 * DynamoDB-specific error handler middleware.
 *
 * Maps known DynamoDB error names to appropriate HTTP status codes
 * and returns a consistent JSON error envelope.
 */

function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${err.name}: ${err.message}`);

  const status = {
    ConditionalCheckFailedException: 409,
    TransactionCanceledException: 409,
    ResourceNotFoundException: 404,
    ProvisionedThroughputExceededException: 429,
    ValidationException: 400,
  }[err.name] || 500;

  const message = status === 500 ? 'Internal server error' : err.message;

  res.status(status).json({ error: message });
}

module.exports = errorHandler;
