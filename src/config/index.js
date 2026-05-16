/**
 * Single, canonical entrypoint for configuration.
 *
 * Re-exports the validated `env` object so feature code can simply do:
 *   import { config } from '../config/index.js';
 *
 * Add cross-cutting derived values here (feature flags, computed paths,
 * etc.) instead of recomputing them everywhere.
 */

import { env } from './env.js';

export const config = env;
export default config;
