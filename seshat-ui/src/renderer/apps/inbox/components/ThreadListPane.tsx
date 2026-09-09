import { Inbox as InboxIcon, LoadingOne, Mail } from '@icon-park/react'
import type { Thread } from '../api/types'
import { STATUS_TABS, channelIcon, displayContact, formatDate } from '../lib/inboxDisplay'

type ThreadListPaneProps = {
  accountsCount: number
  threads: Thread[]
  selectedThreadId: string | null
  statusFilter: string
  threadsLoading: boolean
  threadsHasMore: boolean
  threadsLoadingMore: boolean
  onStatusFilterChange: (status: string) => void
  onSelectThread: (thread: Thread) => void
  onLoadMore: () => void
  onGoToAccounts: () => void
}

export function ThreadListPane({
  accountsCount,
  threads,
  selectedThreadId,
  statusFilter,
  threadsLoading,
  threadsHasMore,
  threadsLoadingMore,
  onStatusFilterChange,
  onSelectThread,
  onLoadMore,
  onGoToAccounts,
}: ThreadListPaneProps) {
  return (
    <div className="ib-thread-list-pane">
      <div className="ib-status-tabs">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            className={statusFilter === tab.id ? 'active' : ''}
            onClick={() => onStatusFilterChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="ib-thread-list">
        {threadsLoading && <div className="ib-empty"><LoadingOne size={16} className="spin" /></div>}
        {!threadsLoading && accountsCount === 0 && (
          <div className="ib-empty ib-empty-connect">
            <InboxIcon size={28} />
            <strong>No inbox connected</strong>
            <span>Connect a channel to start syncing conversations.</span>
            <div>
              <button type="button" className="ib-action-btn primary" onClick={onGoToAccounts}>
                <Mail size={13} /> Go to Accounts
              </button>
            </div>
          </div>
        )}
        {!threadsLoading && accountsCount > 0 && threads.length === 0 && (
          <div className="ib-empty">No matching {statusFilter} threads.</div>
        )}
        {threads.map((thread) => (
          <button
            key={thread.id}
            className={`ib-thread-item ${selectedThreadId === thread.id ? 'selected' : ''}`}
            onClick={() => onSelectThread(thread)}
          >
            <span className="ib-thread-channel">{channelIcon(thread.channel)}</span>
            <span className="ib-thread-copy">
              <strong>{displayContact(thread)}</strong>
              <small>{thread.subject || `${thread.channel} conversation`}</small>
            </span>
            <span className={`ib-priority ${thread.priority_score >= 0.65 ? 'high' : ''}`}>
              {thread.priority_score.toFixed(2)}
            </span>
            <time>{formatDate(thread.last_message_at)}</time>
          </button>
        ))}
        {!threadsLoading && threadsHasMore && (
          <button type="button" className="ib-load-more" onClick={onLoadMore} disabled={threadsLoadingMore}>
            {threadsLoadingMore ? <LoadingOne size={13} className="spin" /> : 'Load more'}
          </button>
        )}
      </div>
    </div>
  )
}
