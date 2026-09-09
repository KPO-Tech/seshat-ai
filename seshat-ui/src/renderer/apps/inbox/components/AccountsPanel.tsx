import { Caution, Close, Inbox as InboxIcon, LoadingOne, Plus, Refresh } from '@icon-park/react'
import type { ChannelAccount } from '../api/types'
import { channelIcon, formatDate, statusTone } from '../lib/inboxDisplay'
import { StatusTile } from './StatusTile'

type AccountsPanelProps = {
  accounts: ChannelAccount[]
  accountsLoading: boolean
  connectedCount: number
  accountsInErrorCount: number
  syncableCount: number
  openCount: number
  syncingAccountId: string | null
  error: string | null
  onRefresh: () => void
  onOpenConnectors: () => void
  onSyncNow: (accountId: string) => void
  onDisconnect: (accountId: string) => void
}

export function AccountsPanel({
  accounts,
  accountsLoading,
  connectedCount,
  accountsInErrorCount,
  syncableCount,
  openCount,
  syncingAccountId,
  error,
  onRefresh,
  onOpenConnectors,
  onSyncNow,
  onDisconnect,
}: AccountsPanelProps) {
  return (
    <section className="ib-accounts-page">
      {error && <div className="ib-error-banner"><Caution size={13} /> {error}</div>}
      <div className="ib-accounts-topline">
        <span>Accounts</span>
        <button type="button" className="ib-action-btn" onClick={onRefresh} disabled={accountsLoading}>
          {accountsLoading ? <LoadingOne size={13} className="spin" /> : <Refresh size={13} />} Refresh
        </button>
        <button type="button" className="ib-action-btn primary" onClick={onOpenConnectors}>
          <Plus size={13} /> Connect
        </button>
      </div>

      <div className="ib-account-summary">
        <StatusTile label="Accounts" value={String(accounts.length)} />
        <StatusTile label="Connected" value={String(connectedCount)} tone="ok" />
        <StatusTile label="Needs Action" value={String(accountsInErrorCount)} tone={accountsInErrorCount > 0 ? 'bad' : 'ok'} />
        <StatusTile label="Syncable" value={String(syncableCount)} />
        <StatusTile label="Visible Open" value={String(openCount)} />
      </div>

      <div className="ib-accounts-grid">
        {accountsLoading ? (
          <div className="ib-account-empty"><LoadingOne size={18} className="spin" /> Loading accounts</div>
        ) : accounts.length === 0 ? (
          <div className="ib-account-empty">
            <InboxIcon size={28} />
            <strong>No account connected</strong>
            <span>Use Connect above to start syncing conversations.</span>
          </div>
        ) : (
          accounts.map((account) => (
            <article key={account.id} className={`ib-account-card ${statusTone(account.status)}`}>
              <div className="ib-account-card-icon">{channelIcon(account.channel, 20)}</div>
              <div className="ib-account-card-copy">
                <strong>{account.display_name || account.external_account_id}</strong>
                <span>{account.channel}</span>
              </div>
              <span className={`ib-account-status ${statusTone(account.status)}`}>{account.status}</span>
              <div className="ib-account-meta">
                <span>Last sync</span>
                <strong>{formatDate(account.last_synced_at)}</strong>
              </div>
              {account.last_error && <div className="ib-account-error"><Caution size={12} /> {account.last_error}</div>}
              <div className="ib-account-card-actions">
                {account.channel === 'gmail' && (
                  <button type="button" onClick={() => onSyncNow(account.id)} disabled={syncingAccountId === account.id}>
                    {syncingAccountId === account.id ? <LoadingOne size={12} className="spin" /> : <Refresh size={12} />} Sync
                  </button>
                )}
                <button type="button" onClick={() => onDisconnect(account.id)}>
                  <Close size={12} /> Disconnect
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
