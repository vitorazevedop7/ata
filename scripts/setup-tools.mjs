// Runs the tool setup script for this platform: PowerShell on Windows, bash on macOS.
// Extra arguments are passed through (e.g. npm run setup:tools -- -NoCuda).

/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain JS, no type annotations */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const script = (name) => fileURLToPath(new URL(name, import.meta.url))
const args = process.argv.slice(2)

const [command, commandArgs] =
  process.platform === 'win32'
    ? [
        'powershell',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script('setup-tools.ps1'), ...args]
      ]
    : ['bash', [script('setup-tools.sh'), ...args]]

if (process.platform !== 'win32' && process.platform !== 'darwin') {
  console.error(
    'setup:tools só cobre Windows e macOS. No Linux, instale ffmpeg, whisper.cpp e Ollama pelo gerenciador de pacotes.'
  )
  process.exit(1)
}

const { status } = spawnSync(command, commandArgs, { stdio: 'inherit' })
process.exit(status ?? 1)
