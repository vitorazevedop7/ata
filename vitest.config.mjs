import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Main-process modules import Electron; the tests only touch code that doesn't call it.
    alias: { electron: fileURLToPath(new URL('test/electron-stub.ts', import.meta.url)) }
  },
  test: {
    include: ['src/**/*.test.ts']
  }
})
