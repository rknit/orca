// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pickMedia, pickMediaInTap } from './pwa-media'

function fileInput(): HTMLInputElement | null {
  return document.querySelector('input[type=file]')
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('pickMedia in the web app', () => {
  it('opens the picker only from a tap on its own sheet', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const picked = pickMedia({ source: 'files', multiple: true })
    await Promise.resolve()
    expect(click).not.toHaveBeenCalled()
    const [choose] = document.querySelectorAll('button')
    expect(choose!.textContent).toBe('Choose files')
    choose!.click()
    expect(click).toHaveBeenCalledTimes(1)
    expect(document.querySelectorAll('button')).toHaveLength(0)
    fileInput()!.dispatchEvent(new Event('cancel'))
    await expect(picked).resolves.toEqual({ items: [] })
  })

  it('settles with nothing when the sheet is cancelled', async () => {
    const picked = pickMedia({ source: 'library', multiple: false })
    await Promise.resolve()
    const [, cancel] = document.querySelectorAll('button')
    cancel!.click()
    await expect(picked).resolves.toEqual({ items: [] })
    expect(fileInput()).toBeNull()
  })
})

describe('pickMediaInTap', () => {
  it('opens the picker in the same turn, with no sheet', () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    void pickMediaInTap({ source: 'library', multiple: true })
    expect(click).toHaveBeenCalledTimes(1)
    expect(document.querySelectorAll('button')).toHaveLength(0)
  })
})
