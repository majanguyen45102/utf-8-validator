/**
 * Public entry point for the UTF-8 validator.
 *
 * Re-exports the validating decoder so callers import a single, stable name
 * regardless of where the implementation lives.
 */
import { decodeUtf8 } from './core.js';

export { decodeUtf8 };
