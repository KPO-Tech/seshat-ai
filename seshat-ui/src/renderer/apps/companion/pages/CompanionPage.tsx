import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Caution, LoadingOne, Plus, Sync } from '@icon-park/react'
import { api } from '@/api/client'
import type { Agent, CreateAgentBody, UpdateAgentBody } from '@/api/types'
import { AVATAR_CSS } from '@/components/agents/avatar'
import { useUIStore } from '@/stores/ui'
import { CreateCard, PlatformCard, UserCard } from '../components/AgentCards'
import { AgentModal } from '../components/AgentModal'
import { DeleteConfirm } from '../components/DeleteConfirm'
import { ToastStack } from '../components/ToastStack'
import { useToast } from '../hooks/useToast'
import { agentToForm, formToBody, type AgentForm } from '../lib/companionForm'
import '../styles/companion.css'

export function CompanionPage() {
  const navigate = useNavigate()
  const collapsed = useUIStore((state) => state.sidebarCollapsed)

  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editTarget, setEditTarget] = useState<Agent | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [launching, setLaunching] = useState<string | null>(null)

  const { toasts, show } = useToast()

  const platformAgents = agents.filter((agent) => agent.source !== 'user')
  const userAgents = agents.filter((agent) => agent.source === 'user')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ agents: Agent[] }>('/agents')
      setAgents(data.agents ?? [])
    } catch (error) {
      setError((error as { message?: string })?.message ?? 'Failed to load agents')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleChat = useCallback(async (agent: Agent) => {
    setLaunching(agent.slug)
    try {
      const session = await api.post<{ session_id: string }>('/sessions', {
        title: agent.name || agent.slug,
        agent_slug: agent.slug,
      })
      navigate(`/conversation/${session.session_id}`)
    } catch (error) {
      show((error as { message?: string })?.message ?? 'Failed to start session', 'err')
    } finally {
      setLaunching(null)
    }
  }, [navigate, show])

  const handleSave = useCallback(async (form: AgentForm) => {
    setSaving(true)
    try {
      if (modal === 'create') {
        const body = formToBody(form)
        const created = await api.post<Agent>('/agents', body)
        setAgents((current) => [...current, created])
        show(`"${created.name || created.slug}" created`)
      } else if (modal === 'edit' && editTarget) {
        const { slug: _, ...rest } = formToBody(form) as CreateAgentBody & { slug?: string }
        const updated = await api.put<Agent>(`/agents/${editTarget.slug}`, rest as UpdateAgentBody)
        setAgents((current) => current.map((agent) => agent.slug === editTarget.slug ? updated : agent))
        show(`"${updated.name || updated.slug}" updated`)
      }
      setModal(null)
      setEditTarget(null)
    } catch (error) {
      show((error as { message?: string })?.message ?? 'Save failed', 'err')
    } finally {
      setSaving(false)
    }
  }, [editTarget, modal, show])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/agents/${deleteTarget.slug}`)
      setAgents((current) => current.filter((agent) => agent.slug !== deleteTarget.slug))
      show(`"${deleteTarget.name || deleteTarget.slug}" deleted`)
      setDeleteTarget(null)
    } catch (error) {
      show((error as { message?: string })?.message ?? 'Delete failed', 'err')
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, show])

  const openEdit = (agent: Agent) => {
    setEditTarget(agent)
    setModal('edit')
  }

  const closeModal = () => {
    setModal(null)
    setEditTarget(null)
  }

  return (
    <div className="cmp-root" data-sidebar-collapsed={collapsed}>
      <style>{AVATAR_CSS}</style>
      <ToastStack toasts={toasts} />

      <div className="cmp-topbar">
        <h1 className="cmp-title">Companion</h1>
        <div className="cmp-topbar-right">
          <button className="cmp-btn cmp-btn--ghost cmp-btn--icon" onClick={load} aria-label="Refresh">
            <Sync theme="outline" size={16} />
          </button>
          <button className="cmp-btn cmp-btn--primary" onClick={() => setModal('create')}>
            <Plus theme="outline" size={16} />
            New companion
          </button>
        </div>
      </div>

      <div className="cmp-body">
        {loading && (
          <div className="cmp-center">
            <LoadingOne size={24} className="spin" />
            <p>Loading companions...</p>
          </div>
        )}

        {!loading && error && (
          <div className="cmp-center cmp-center--err">
            <Caution size={20} />
            <p>{error}</p>
            <button className="cmp-btn cmp-btn--ghost" onClick={load}>Retry</button>
          </div>
        )}

        {!loading && !error && (
          <>
            {platformAgents.length > 0 && (
              <section className="cmp-section">
                <div className="cmp-section-header">
                  <h2 className="cmp-section-title">Platform agents</h2>
                  <p className="cmp-section-sub">Built and maintained by the platform. Available to all users.</p>
                </div>
                <div className="cmp-grid">
                  {platformAgents.map((agent) => (
                    <PlatformCard
                      key={agent.slug}
                      agent={agent}
                      onChat={launching === agent.slug ? () => {} : handleChat}
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="cmp-section">
              <div className="cmp-section-header">
                <h2 className="cmp-section-title">My companions</h2>
                <p className="cmp-section-sub">Custom agents you've created, each with their own face.</p>
              </div>
              <div className="cmp-grid">
                <CreateCard onClick={() => setModal('create')} />
                {userAgents.map((agent) => (
                  <UserCard
                    key={agent.slug}
                    agent={agent}
                    onChat={launching === agent.slug ? () => {} : handleChat}
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
              {userAgents.length === 0 && (
                <p className="cmp-empty">No custom companions yet. Create one to get started.</p>
              )}
            </section>
          </>
        )}
      </div>

      {(modal === 'create' || modal === 'edit') && (
        <AgentModal
          initial={modal === 'edit' && editTarget ? agentToForm(editTarget) : null}
          onSave={handleSave}
          onClose={closeModal}
          saving={saving}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          agent={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}
    </div>
  )
}
