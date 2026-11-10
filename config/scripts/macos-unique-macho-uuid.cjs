const { createHash } = require('node:crypto')
const { existsSync, readdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

// Why: macOS Local Network privacy keys its allow/deny decision on the main executable's
// LC_UUID (Apple TN3179). Electron ships a fixed UUID per release, so every app on the same
// Electron build shares one decision: a denied Todoist silently denied Orca's LAN access.

const MH_MAGIC_64 = 0xfeedfacf
const FAT_MAGIC = 0xcafebabe
const FAT_MAGIC_64 = 0xcafebabf
const LC_UUID = 0x1b

/** Stable across versions so an update does not reset the user's Local Network grant. */
function deriveUuid(seed, cputype) {
  const bytes = createHash('sha256').update(`${seed}\0${cputype}`).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50 // RFC 4122 version 5 layout
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return bytes
}

function rewriteThinSlice(buf, offset, seed) {
  if (buf.readUInt32LE(offset) !== MH_MAGIC_64) {
    throw new Error(`Unsupported Mach-O slice at offset ${offset}`)
  }
  const cputype = buf.readInt32LE(offset + 4)
  const ncmds = buf.readUInt32LE(offset + 16)
  let cmd = offset + 32
  for (let i = 0; i < ncmds; i++) {
    const kind = buf.readUInt32LE(cmd)
    const size = buf.readUInt32LE(cmd + 4)
    if (kind === LC_UUID) {
      deriveUuid(seed, cputype).copy(buf, cmd + 8)
      return true
    }
    cmd += size
  }
  return false
}

/** Rewrites every slice's LC_UUID in place; must run before code signing. */
function setUniqueMachOUuid(path, seed) {
  const buf = readFileSync(path)
  const magic = buf.readUInt32BE(0)
  let rewritten = 0
  if (magic === FAT_MAGIC || magic === FAT_MAGIC_64) {
    const count = buf.readUInt32BE(4)
    const entrySize = magic === FAT_MAGIC ? 20 : 32
    for (let i = 0; i < count; i++) {
      const entry = 8 + i * entrySize
      const offset =
        magic === FAT_MAGIC ? buf.readUInt32BE(entry + 8) : Number(buf.readBigUInt64BE(entry + 8))
      if (rewriteThinSlice(buf, offset, seed)) {
        rewritten++
      }
    }
  } else if (rewriteThinSlice(buf, 0, seed)) {
    rewritten++
  }
  if (rewritten === 0) {
    throw new Error(`No LC_UUID found in ${path}`)
  }
  writeFileSync(path, buf)
}

/** Gives the app executable and its Electron Helpers UUIDs no other Electron app shares. */
function applyUniqueMacExecutableUuids(appPath, productFilename, bundleId) {
  const targets = [[join(appPath, 'Contents', 'MacOS', productFilename), productFilename]]
  const frameworks = join(appPath, 'Contents', 'Frameworks')
  for (const entry of readdirSync(frameworks, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(`${productFilename} Helper`)) {
      continue
    }
    const name = entry.name.replace(/\.app$/, '')
    const exe = join(frameworks, entry.name, 'Contents', 'MacOS', name)
    if (existsSync(exe)) {
      targets.push([exe, name])
    }
  }
  for (const [path, name] of targets) {
    setUniqueMachOUuid(path, `${bundleId}\0${name}`)
  }
  return targets.map(([path]) => path)
}

module.exports = { applyUniqueMacExecutableUuids, setUniqueMachOUuid }
