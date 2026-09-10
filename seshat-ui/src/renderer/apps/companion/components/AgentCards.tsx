import { Delete, Edit, Plus, Robot, Send } from '@icon-park/react'
import { AgentAvatar } from '@/components/agents/avatar'
import type { Agent } from '@/api/types'

type AgentCardProps = {
  agent: Agent
  onChat: (agent: Agent) => void
}

export function PlatformCard({ agent, onChat }: AgentCardProps) {
  const toolCount = agent.tools?.length ?? 0
  const allTools = !agent.tools || (agent.tools.length === 1 && agent.tools[0] === '*')

  return (
    <div className="cmp-card cmp-card--platform">
      <div className="cmp-card-header">
        <AgentAvatar agent={agent} size={42} />
        <div className="cmp-card-meta">
          <span className="cmp-card-name">{agent.name || agent.slug}</span>
          <span className="cmp-badge cmp-badge--platform">
            {agent.source === 'organization' ? 'Organization' : 'Platform'}
          </span>
        </div>
      </div>

      {agent.when_to_use && <p className="cmp-card-desc">{agent.when_to_use}</p>}

      <div className="cmp-card-tools">
        <Robot theme="outline" size={12} />
        <span>{allTools ? 'All tools' : `${toolCount} tool${toolCount !== 1 ? 's' : ''}`}</span>
        {agent.max_turns > 0 && <span className="cmp-dot" />}
        {agent.max_turns > 0 && <span>{agent.max_turns} turns</span>}
      </div>

      <div className="cmp-card-actions">
        <button className="cmp-btn cmp-btn--primary cmp-btn--full" onClick={() => onChat(agent)}>
          <Send theme="outline" size={14} />
          Chat
        </button>
      </div>
    </div>
  )
}

type UserCardProps = AgentCardProps & {
  onEdit: (agent: Agent) => void
  onDelete: (agent: Agent) => void
}

export function UserCard({ agent, onChat, onEdit, onDelete }: UserCardProps) {
  const allTools = !agent.tools || (agent.tools.length === 1 && agent.tools[0] === '*')

  return (
    <div className="cmp-card cmp-card--user">
      <div className="cmp-card-header">
        <AgentAvatar agent={agent} size={42} />
        <div className="cmp-card-meta">
          <span className="cmp-card-name">{agent.name || agent.slug}</span>
          {!agent.enabled && <span className="cmp-badge cmp-badge--disabled">Disabled</span>}
        </div>
      </div>

      {agent.when_to_use && <p className="cmp-card-desc">{agent.when_to_use}</p>}

      <div className="cmp-card-tools">
        <Robot theme="outline" size={12} />
        <span>{allTools ? 'All tools' : `${agent.tools?.length ?? 0} tool${agent.tools?.length !== 1 ? 's' : ''}`}</span>
        {agent.max_turns > 0 && <span className="cmp-dot" />}
        {agent.max_turns > 0 && <span>{agent.max_turns} turns</span>}
      </div>

      <div className="cmp-card-actions">
        <button className="cmp-btn cmp-btn--primary" onClick={() => onChat(agent)}>
          <Send theme="outline" size={14} />
          Chat
        </button>
        <button className="cmp-btn cmp-btn--ghost" onClick={() => onEdit(agent)} aria-label="Edit">
          <Edit theme="outline" size={14} />
        </button>
        <button className="cmp-btn cmp-btn--ghost cmp-btn--danger" onClick={() => onDelete(agent)} aria-label="Delete">
          <Delete theme="outline" size={14} />
        </button>
      </div>
    </div>
  )
}

export function CreateCard({ onClick }: { onClick: () => void }) {
  return (
    <button className="cmp-card cmp-card--create" onClick={onClick}>
      <Plus theme="outline" size={24} />
      <span>New companion</span>
    </button>
  )
}
