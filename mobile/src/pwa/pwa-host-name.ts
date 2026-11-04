const PERSONAL_NAME_KEY = 'orca-pwa:personal-name'

export function readPersonalHostName(): string | null {
  return localStorage.getItem(PERSONAL_NAME_KEY)
}

export function savePersonalHostName(name: string | null): void {
  if (name === null) {
    localStorage.removeItem(PERSONAL_NAME_KEY)
  } else {
    localStorage.setItem(PERSONAL_NAME_KEY, name)
  }
}
