// Builds the Windows installer from the current checkout and installs it for
// this user, replacing the installed Ata. Recordings are kept: they
// live in %APPDATA%\ata, outside the install folder.
//
// Windows Smart App Control blocks each freshly built (unsigned) installer. When
// that happens and only the app code changed, the already-trusted installed exe
// is kept and just resources\app.asar is replaced (the old one is kept as .bak).
//
// Usage: npm run install:app            (stops if the app is open)
//        npm run install:app -- --force (closes the app first)

/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain JS, no type annotations */

import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const EXE = 'ata.exe'
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
      'O Ata está aberto. Feche o app (ou confirme que não há gravação nem ' +
        'transcrição em andamento) e rode de novo com: npm run install:app -- --force'
    )
  }
  console.log('Fechando o Ata...')
  spawnSync('taskkill', ['/IM', EXE, '/F'], { stdio: 'ignore' })
}

console.log('Gerando o instalador...')
const build = spawnSync('npm run build:win', { stdio: 'inherit', shell: true })
if (build.status !== 0) fail('A geração do instalador falhou.')

const { name, version } = JSON.parse(readFileSync('package.json', 'utf8'))
const installer = join('dist', `${name}-${version}-setup.exe`)
if (!existsSync(installer)) fail(`Instalador não encontrado: ${installer}`)

const installDir = join(process.env.LOCALAPPDATA ?? '', 'Programs', name)
const installed = join(installDir, EXE)
const unpacked = join('dist', 'win-unpacked')
const ASAR = join('resources', 'app.asar')

function filesIn(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
}

/** Electron fuse "EnableEmbeddedAsarIntegrityValidation" (index 4) of an exe. */
function asarIntegrityChecked(exe) {
  const data = readFileSync(exe)
  const at = data.indexOf('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX')
  if (at === -1) return true
  const wire = data.subarray(at + 34, at + 34 + data[at + 33]).toString()
  return wire[4] !== '0'
}

/**
 * Why app.asar alone can't update the installed app, or null when it can: the
 * installed exe must not check the archive's hash, and every other file of the
 * new build must already be installed as is (the exe only differs by that hash).
 */
function whyNotAsarOnly() {
  if (!existsSync(installed)) return 'o app ainda não está instalado'
  if (asarIntegrityChecked(installed)) return 'o app instalado confere o hash do app.asar'
  if (statSync(installed).size !== statSync(join(unpacked, EXE)).size)
    return 'o executável mudou (outra versão do Electron?)'
  for (const file of filesIn(unpacked)) {
    if (file === EXE || file === ASAR) continue
    const target = join(installDir, file)
    if (!existsSync(target) || !readFileSync(target).equals(readFileSync(join(unpacked, file))))
      return `mudou ${file}`
  }
  return null
}

console.log(`Instalando ${installer}...`)
const install = spawnSync(installer, ['/S'], { stdio: 'inherit' })
if (install.status !== 0) {
  // Smart App Control's block shows up as a spawn error (status null).
  console.log(
    `\nO Windows não deixou o instalador rodar (código ${install.status}; em geral é o ` +
      'Controle Inteligente de Aplicativos, que bloqueia instaladores sem assinatura).'
  )
  const reason = whyNotAsarOnly()
  if (reason) {
    fail(
      `Não dá para atualizar só o app.asar: ${reason}. Rode ${installer} pelo Explorador ` +
        'de Arquivos ou permita o instalador nas configurações de segurança do Windows.'
    )
  }
  const target = join(installDir, ASAR)
  copyFileSync(target, `${target}.bak`)
  copyFileSync(join(unpacked, ASAR), target)
  console.log(
    `\nAta ${version} atualizado trocando só ${target} ` + '(o anterior ficou em app.asar.bak).'
  )
  process.exit(0)
}

if (!existsSync(installed)) fail(`O app não apareceu em ${installed}.`)

// The silent installer opens the app when it finishes; leave it closed.
for (let i = 0; i < 10 && !isRunning(); i++) await new Promise((r) => setTimeout(r, 500))
spawnSync('taskkill', ['/IM', EXE, '/F'], { stdio: 'ignore' })

console.log(`\nAta ${version} instalado em ${installed}.`)
