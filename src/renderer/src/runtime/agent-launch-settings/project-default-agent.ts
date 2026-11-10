import type { AppState } from '@/store/types'
import { useAppStore } from '@/store/index'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { ProjectDefaultTuiAgent } from '../../../../shared/agent-launch/catalog/project-default-tui-agent'
import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'
import { isTuiAgentEnabled } from '../../../../shared/agent-launch/catalog/tui-agent-selection'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree/id'
import { findRepoForHost } from '@/store/slices/repo-host-identity'
import type { ProspectiveWorkspace } from '@/lib/agent-launch-route-input'

export function readProjectDefaultTuiAgent(
  state: Pick<AppState, 'repos' | 'settings'>,
  workspace: ProspectiveWorkspace,
  executionHostId: string | null | undefined
): ProjectDefaultTuiAgent | undefined {
  if (workspace.kind === 'floating') {
    return undefined
  }
  const repoId =
    workspace.repoId ??
    (workspace.worktreeId ? getRepoIdFromWorktreeId(workspace.worktreeId) : undefined)
  if (!repoId) {
    return undefined
  }
  const repo =
    (executionHostId ? findRepoForHost(state.repos, repoId, { hostId: executionHostId }) : null) ??
    findRepoForHost(state.repos, repoId, { settings: state.settings })
  return repo?.defaultTuiAgent
}

/** The project's default wins over the host's unless the host disabled that agent. */
export function withProjectDefaultTuiAgent<
  T extends {
    defaultTuiAgent?: TuiAgent | 'blank' | null
    disabledTuiAgents?: readonly TuiAgent[] | null
  }
>(preferences: T, projectDefault: ProjectDefaultTuiAgent | undefined): T {
  if (
    !projectDefault ||
    (projectDefault !== 'blank' &&
      !isTuiAgentEnabled(projectDefault, preferences.disabledTuiAgents))
  ) {
    return preferences
  }
  return { ...preferences, defaultTuiAgent: projectDefault }
}

/** The default a launch in `workspace` starts with, before host-owned runtime preferences load. */
export function readWorkspaceDefaultTuiAgent(
  state: Pick<AppState, 'repos' | 'settings'>,
  workspace: ProspectiveWorkspace
): TuiAgent | 'blank' | null | undefined {
  const projectDefault = readProjectDefaultTuiAgent(state, workspace, workspace.executionHostId)
  return withProjectDefaultTuiAgent(
    {
      defaultTuiAgent: state.settings?.defaultTuiAgent,
      disabledTuiAgents: state.settings?.disabledTuiAgents
    },
    projectDefault
  ).defaultTuiAgent
}

export function useProjectAgentMenuSettings<
  T extends Partial<Pick<GlobalSettings, 'defaultTuiAgent' | 'disabledTuiAgents'>> | null
>(hostSettings: T, workspace: ProspectiveWorkspace | null, executionHostId: string): T {
  const projectDefault = useAppStore((state) =>
    workspace ? readProjectDefaultTuiAgent(state, workspace, executionHostId) : undefined
  )
  return hostSettings && withProjectDefaultTuiAgent(hostSettings, projectDefault)
}
