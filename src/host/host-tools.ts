/**
 * Host-only tools: tools that execute on the Node.js host, not the Chrome extension.
 * - get_session / clear_session: session transcript management
 * - save_file: write generated tests to disk
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname, isAbsolute, relative } from 'path';
import { SessionRecorder } from './session-recorder.js';

export const sessionRecorder = new SessionRecorder();

/** Get the current working directory (project root for save_file). */
const PROJECT_ROOT = process.cwd();

interface SaveFileArgs {
  path: string;
  content: string;
}

/** Validate and write file to disk. Returns result object. */
export function handleSaveFile(args: SaveFileArgs): { success: boolean; path?: string; error?: string } {
  const { path: filePath, content } = args;

  if (!filePath || typeof filePath !== 'string') {
    return { success: false, error: 'path is required' };
  }
  if (typeof content !== 'string') {
    return { success: false, error: 'content must be a string' };
  }

  // Security: reject path traversal
  if (filePath.includes('..')) {
    return { success: false, error: 'Path traversal (..) not allowed' };
  }

  // Resolve to absolute path within project root
  let absPath: string;
  if (isAbsolute(filePath)) {
    // Absolute path must be within project root
    const rel = relative(PROJECT_ROOT, filePath);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      return { success: false, error: `Path must be within project: ${PROJECT_ROOT}` };
    }
    absPath = filePath;
  } else {
    absPath = resolve(PROJECT_ROOT, filePath);
  }

  try {
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, content, 'utf-8');
    console.error(`[host] File written: ${absPath}`);
    return { success: true, path: absPath };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
