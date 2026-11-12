import { type ChildProcess, spawn } from 'child_process'

const children = new Set<ChildProcess>()

/** Runs a command, streaming each output line to onLine; rejects with the last lines on failure. */
export function run(
  command: string,
  args: string[],
  onLine?: (line: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true })
    children.add(child)
    const tail: string[] = []
    const collect = (chunk: Buffer): void => {
      for (const line of chunk.toString('utf8').split(/\r?\n/)) {
        if (!line.trim()) continue
        onLine?.(line)
        tail.push(line)
        if (tail.length > 15) tail.shift()
      }
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('error', (error) => {
      children.delete(child)
      reject(error)
    })
    child.on('close', (code) => {
      children.delete(child)
      if (code === 0) resolve()
      else reject(new Error(`${command} saiu com código ${code}:\n${tail.join('\n')}`))
    })
  })
}

/** Kills every process started by run(); used when the app quits. */
export function killAll(): void {
  for (const child of children) child.kill()
  children.clear()
}
