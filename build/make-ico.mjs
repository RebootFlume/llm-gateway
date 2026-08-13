import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const dir = path.join(process.cwd(), 'build', 'icon')
const sizes = [256, 128, 64, 48, 32, 16]

const entries = sizes.map((size) => {
  const data = readFileSync(path.join(dir, `icon-${size}.png`))
  return { size, data }
})

const count = entries.length
const headerSize = 6
const entrySize = 16
let offset = headerSize + count * entrySize
const header = Buffer.alloc(headerSize)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(count, 4)

const entryBuffers = entries.map(({ size, data }) => {
  const entry = Buffer.alloc(entrySize)
  entry.writeUInt8(size >= 256 ? 0 : size, 0)
  entry.writeUInt8(size >= 256 ? 0 : size, 1)
  entry.writeUInt8(0, 2)
  entry.writeUInt8(0, 3)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(data.length, 8)
  entry.writeUInt32LE(offset, 12)
  offset += data.length
  return { entry, data }
})

const chunks = [
  header,
  ...entryBuffers.map((e) => e.entry),
  ...entryBuffers.map((e) => e.data),
]
writeFileSync(path.join(dir, 'icon.ico'), Buffer.concat(chunks))
console.log('icon.ico written,', offset, 'bytes')

// ── macOS .icns ───────────────────────────────────────
const icnsMap = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
]
const icnsParts = []
for (const [type, size] of icnsMap) {
  const png = readFileSync(path.join(dir, `icon-${size}.png`))
  const block = Buffer.alloc(8 + png.length)
  block.write(type, 0, 'ascii')
  block.writeUInt32BE(8 + png.length, 4)
  png.copy(block, 8)
  icnsParts.push(block)
}
const icnsTotal = 8 + icnsParts.reduce((a, b) => a + b.length, 0)
const icns = Buffer.concat([
  Buffer.from('icns', 'ascii'),
  (() => {
    const b = Buffer.alloc(4)
    b.writeUInt32BE(icnsTotal, 0)
    return b
  })(),
  ...icnsParts,
])
writeFileSync(path.join(dir, 'icon.icns'), icns)
console.log('icon.icns written,', icnsTotal, 'bytes')
