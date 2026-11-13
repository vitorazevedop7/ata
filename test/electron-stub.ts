// Minimal stand-in for the 'electron' module in unit tests.
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/** A fresh folder per test run, so app data never lands in a real profile. */
const userData = mkdtempSync(join(tmpdir(), 'ata-test-'))

export const app = { getPath: (): string => userData, on: (): void => undefined }
export const ipcMain = { handle: (): void => undefined }
export const BrowserWindow = { getAllWindows: (): unknown[] => [] }
