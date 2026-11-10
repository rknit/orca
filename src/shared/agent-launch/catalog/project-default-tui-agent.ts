import type { TuiAgent } from './tui-agent'
import { isTuiAgent } from './tui-agent-config'

/** Per-project launch default; 'blank' opens a plain terminal. Absent inherits the host default. */
export type ProjectDefaultTuiAgent = TuiAgent | 'blank'

/** null clears the override; undefined means absent or malformed. */
export function normalizeProjectDefaultTuiAgent(
  value: unknown
): ProjectDefaultTuiAgent | null | undefined {
  if (value === null) {
    return null
  }
  return value === 'blank' || isTuiAgent(value) ? value : undefined
}
