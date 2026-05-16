/**
 * Express async wrapper.
 *
 * Express 4 does not automatically forward rejected promises to the
 * error middleware. Wrap every async route/middleware with this so a
 * rejection becomes `next(err)` instead of an unhandled rejection.
 *
 * Usage:
 *   router.post('/upload', asyncHandler(async (req, res) => { ... }));
 *
 * Express 5 will make this redundant — when we upgrade, remove the
 * wrapper at the same time.
 */

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
