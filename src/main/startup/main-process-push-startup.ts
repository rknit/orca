import type { OrcaRuntimeRpcServer } from '../runtime/runtime-rpc'

// Pushes carry agent output in plaintext through push.onorca.dev, so this build never starts them.
export function startDesktopPushService(_runtimeRpc: OrcaRuntimeRpcServer): void {}
