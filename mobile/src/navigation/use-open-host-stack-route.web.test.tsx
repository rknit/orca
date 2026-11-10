import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'

const handoff = vi.hoisted(() => ({ push: vi.fn() }))

// The handoff, not Expo's router, decides whether the target may mount under this document's grants.
vi.mock('./route-handoff', () => ({ useRouteHandoff: () => handoff }))
vi.mock('expo-router', () => ({
  useRouter: () => {
    throw new Error('a raw router push would keep the opener grants')
  }
}))

import { useOpenHostStackRoute } from './use-open-host-stack-route.web'

describe('useOpenHostStackRoute on the web', () => {
  it('opens a session through the route handoff', () => {
    let open: ReturnType<typeof useOpenHostStackRoute> | null = null
    function Screen(): null {
      open = useOpenHostStackRoute()
      return null
    }
    act(() => {
      create(<Screen />)
    })
    open!('host-a', {
      name: '[hostId]/session/[worktreeId]',
      params: { hostId: 'host-a', worktreeId: 'wt 1', tab: 'chat' }
    })
    expect(handoff.push).toHaveBeenCalledWith('/h/host-a/session/wt%201?tab=chat')
  })
})
