// Names are per server: the name a server reports, and the phone's own rename of it.
let activeHostId = 'server'

export function setActiveHostForNames(hostId: string): void {
  activeHostId = hostId
}

export function readPersonalHostName(hostId: string = activeHostId): string | null {
  return localStorage.getItem(`orca-pwa:personal-name:${hostId}`)
}

export function savePersonalHostName(name: string | null): void {
  const key = `orca-pwa:personal-name:${activeHostId}`
  if (name === null) {
    localStorage.removeItem(key)
  } else {
    localStorage.setItem(key, name)
  }
}

export function readMachineName(hostId: string = activeHostId): string | null {
  return localStorage.getItem(`orca-pwa:machine-name:${hostId}`)
}

export function saveMachineName(name: string): void {
  localStorage.setItem(`orca-pwa:machine-name:${activeHostId}`, name)
}

/** Names from before this app held several servers belong to its first one. */
export function migrateLegacyHostNames(firstHostId: string): void {
  for (const kind of ['personal-name', 'machine-name']) {
    const legacy = localStorage.getItem(`orca-pwa:${kind}`)
    if (legacy !== null) {
      localStorage.setItem(`orca-pwa:${kind}:${firstHostId}`, legacy)
      localStorage.removeItem(`orca-pwa:${kind}`)
    }
  }
}
