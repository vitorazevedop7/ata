// Minimal stand-in for the 'electron' module in unit tests.
import { tmpdir } from 'os'

export const app = { getPath: (): string => tmpdir() }
export const ipcMain = { handle: (): void => undefined }
export const BrowserWindow = { getAllWindows: (): unknown[] => [] }
