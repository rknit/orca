import { useMemo, useState } from 'react'
import type { Repo } from '../../../../../shared/repo-types'
import type { ProjectDefaultTuiAgent } from '../../../../../shared/agent-launch/catalog/project-default-tui-agent'
import { isTuiAgentEnabled } from '../../../../../shared/agent-launch/catalog/tui-agent-selection'
import { getRepoExecutionHostId } from '../../../../../shared/execution-host'
import { getRepoMainWorktreeId } from '../../../../../shared/worktree/id'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { useAgentDetectionTargetForWorktree } from '@/hooks/useAgentDetectionTarget'
import { useDetectedAgents } from '@/hooks/useDetectedAgents'
import { useAppStore } from '@/store/index'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from '../section-layout/SearchableSetting'
import { AgentDefaultSetting } from '../agents/launch/AgentDefaultSetting'

export function RepositoryDefaultAgentSection({
  repo,
  updateRepo,
  forceVisible
}: {
  repo: Repo
  updateRepo: (id: string, updates: { defaultTuiAgent: ProjectDefaultTuiAgent | null }) => unknown
  forceVisible?: boolean
}): React.JSX.Element {
  const hostId = getRepoExecutionHostId(repo)
  const detectionTarget = useAgentDetectionTargetForWorktree(getRepoMainWorktreeId(repo))
  const { detectedIds: detected } = useDetectedAgents(detectionTarget, 'all')
  const detectedIds = useMemo(() => (detected ? new Set<string>(detected) : null), [detected])
  const disabledTuiAgents = useAppStore((state) => state.settings?.disabledTuiAgents)
  const catalog = getAgentCatalog()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apply = async (agent: ProjectDefaultTuiAgent | null): Promise<void> => {
    if (saving || agent === (repo.defaultTuiAgent ?? null)) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await updateRepo(repo.id, { defaultTuiAgent: agent })
      const echoed = useAppStore
        .getState()
        .repos.find(
          (entry) => entry.id === repo.id && getRepoExecutionHostId(entry) === hostId
        )?.defaultTuiAgent
      if (result === false) {
        throw new Error(
          translate(
            'components.RepositoryDefaultAgentSection.saveFailed',
            'Could not save the default agent.'
          )
        )
      }
      // Older runtimes drop unknown repo fields; surface it instead of silently reverting.
      if ((echoed ?? null) !== agent) {
        throw new Error(
          translate(
            'components.RepositoryDefaultAgentSection.runtimeUpdate',
            'Update this runtime to save a project default agent.'
          )
        )
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SearchableSetting
      title={translate('components.RepositoryDefaultAgentSection.title', 'Default Agent')}
      description={translate(
        'components.RepositoryDefaultAgentSection.description',
        'Default agent for new agents in this project. Overrides the host default.'
      )}
      keywords={['agent', 'default', repo.displayName]}
      forceVisible={forceVisible}
      className="space-y-2"
    >
      <AgentDefaultSetting
        defaultAgent={repo.defaultTuiAgent ?? null}
        detectedIds={detectedIds}
        enabledDetectedAgents={catalog.filter(
          (agent) =>
            detectedIds?.has(agent.id) === true && isTuiAgentEnabled(agent.id, disabledTuiAgents)
        )}
        catalog={catalog}
        description={translate(
          'components.RepositoryDefaultAgentSection.description',
          'Default agent for new agents in this project. Overrides the host default.'
        )}
        autoLabel={translate(
          'components.RepositoryDefaultAgentSection.inherit',
          'Use host default'
        )}
        clearValue={null}
        onSetDefault={(agent) => void apply(agent)}
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </SearchableSetting>
  )
}
