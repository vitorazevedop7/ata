// Builds the Windows installer from the current checkout and installs it for
// this user, replacing the installed Granola Local. Recordings are kept: they
// live in %APPDATA%\granola-local, outside the install folder.
//
// Usage: npm run install:app            (stops if the app is open)
//        npm run install:app -- --force (closes the app first)

/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain JS, no type annotations */

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const EXE = 'granola-local.exe'
const force = process.argv.includes('--force')

function fail(message) {
  console.error(`\n${message}`)
  process.exit(1)
}

if (process.platform !== 'win32') fail('install:app só funciona no Windows.')

function isRunning() {
  const out = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${EXE}`, '/NH'], { encoding: 'utf8' })
  return out.toLowerCase().includes(EXE)
}

// Check before the slow build: closing the app could interrupt a recording or a transcription.
if (isRunning()) {
  if (!force) {
    fail(
      'O Granola Local está aberto. Feche o app (ou confirme que não há gravação nem ' +
        'transcrição em andamento) e rode de novo com: npm run install:app -- --force'
    )
  }
  console.log('Fechando o Granola Local...')
  spawnSync('taskkill', ['/IM', EXE, '/F'], { stdio: 'ignore' })
}

console.log('Gerando o instalador...')
const build = spawnSync('npm run build:win', { stdio: 'inherit', shell: true })
if (build.status !== 0) fail('A geração do instalador falhou.')

const { name, version } = JSON.parse(readFileSync('package.json', 'utf8'))
const installer = join('dist', `${name}-${version}-setup.exe`)
if (!existsSync(installer)) fail(`Instalador não encontrado: ${installer}`)

console.log(`Instalando ${installer}...`)
const install = spawnSync(installer, ['/S'], { stdio: 'inherit' })
if (install.status !== 0) fail(`O instalador saiu com código ${install.status}.`)

const installed = join(process.env.LOCALAPPDATA ?? '', 'Programs', name, EXE)
if (!existsSync(installed)) fail(`O app não apareceu em ${installed}.`)

// The silent installer opens the app when it finishes; leave it closed.
for (let i = 0; i < 10 && !isRunning(); i++) await new Promise((r) => setTimeout(r, 500))
spawnSync('taskkill', ['/IM', EXE, '/F'], { stdio: 'ignore' })

console.log(`\nGranola Local ${version} instalado em ${installed}.`)
