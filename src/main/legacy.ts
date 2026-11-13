import { existsSync, renameSync } from 'fs'

/** Folder name used before the app was renamed to Ata. */
export const LEGACY_NAME = 'granola-local'

/**
 * Moves a data folder left under the app's previous name to its new place, once.
 * Returns the folder to use: the new one, or the old one when it can't be moved
 * (for example, while Ollama holds files open in the models folder).
 */
export function adoptLegacyDir(dir: string, legacyDir: string): string {
  if (existsSync(dir) || !existsSync(legacyDir)) return dir
  try {
    renameSync(legacyDir, dir)
    return dir
  } catch {
    return legacyDir
  }
}
