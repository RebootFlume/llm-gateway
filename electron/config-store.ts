import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * Portable config: `<exe_dir>/data/`.
 * In development (unpackaged) this resolves to `<project>/data/` so the whole
 * folder stays movable and matches the previous Tauri behaviour.
 */
export function dataDir(): string {
  const base = app.isPackaged
    ? path.dirname(app.getPath('exe'))
    : process.cwd()
  return path.join(base, 'data')
}

function configPath(): string {
  return path.join(dataDir(), 'config.json')
}

export async function loadConfig(): Promise<unknown | null> {
  try {
    const file = configPath()
    const s = await fs.readFile(file, 'utf-8')
    return JSON.parse(s)
  } catch {
    return null
  }
}

export async function saveConfig(config: unknown): Promise<void> {
  const dir = dataDir()
  await fs.mkdir(dir, { recursive: true })
  const file = configPath()
  const s = JSON.stringify(config, null, 2)
  const tmp = file + '.tmp'
  await fs.writeFile(tmp, s, 'utf-8')
  await fs.rename(tmp, file)
}
