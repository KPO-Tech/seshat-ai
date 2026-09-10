import {
  AlarmClock,
  CheckOne,
  Flag,
  Inbox as InboxIcon,
  LoadingOne,
  Message,
  Paperclip,
  Robot,
} from '@icon-park/react'
import type { Attachment, Thread, ThreadMessage } from '../api/types'
import { displayContact, formatAttachmentSize, formatDate } from '../lib/inboxDisplay'

type ThreadDetailPaneProps = {
  accountsCount: number
  selectedThreadId: string | null
  selectedThread: Thread | null
  messages: ThreadMessage[]
  threadLoading: boolean
  messagesHasMore: boolean
  messagesLoadingMore: boolean
  launchingAgent: boolean
  onAskAgent: () => void
  onUpdateStatus: (status: string) => void
  onLoadEarlierMessages: () => void
  onDownloadAttachment: (messageId: string, attachment: Attachment) => void
}

export function ThreadDetailPane({
  accountsCount,
  selectedThreadId,
  selectedThread,
  messages,
  threadLoading,
  messagesHasMore,
  messagesLoadingMore,
  launchingAgent,
  onAskAgent,
  onUpdateStatus,
  onLoadEarlierMessages,
  onDownloadAttachment,
}: ThreadDetailPaneProps) {
  return (
    <div className="ib-detail-pane">
      {!selectedThreadId && (
        <div className="ib-empty ib-empty-detail">
          {accountsCount === 0 ? (
            <>
              <InboxIcon size={36} />
              <strong>Connect an inbox</strong>
              <span>Gmail and WhatsApp conversations will appear here once a channel is connected.</span>
            </>
          ) : (
            <>
              <Message size={36} />
              <strong>Select a thread</strong>
              <span>Read the conversation, review attachments, or ask the Inbox Agent to draft a reply.</span>
            </>
          )}
        </div>
      )}
      {selectedThreadId && threadLoading && <div className="ib-empty"><LoadingOne size={16} className="spin" /></div>}
      {selectedThreadId && !threadLoading && selectedThread && (
        <>
          <div className="ib-detail-header">
            <div className="ib-detail-title">
              <strong>{displayContact(selectedThread)}</strong>
              <span>{selectedThread.subject || `${selectedThread.channel} conversation`}</span>
            </div>
            <div className="ib-detail-actions">
              <button type="button" onClick={onAskAgent} disabled={launchingAgent}>
                {launchingAgent ? <LoadingOne size={13} className="spin" /> : <Robot size={13} />} Agent
              </button>
              <button type="button" onClick={() => onUpdateStatus('handled')}>
                <CheckOne size={13} /> Handled
              </button>
              <button type="button" onClick={() => onUpdateStatus('snoozed')}>
                <AlarmClock size={13} /> Snooze
              </button>
              <button type="button" onClick={() => onUpdateStatus('escalated')}>
                <Flag size={13} /> Escalate
              </button>
            </div>
          </div>
          <div className="ib-messages">
            {messagesHasMore && (
              <button type="button" className="ib-load-more" onClick={onLoadEarlierMessages} disabled={messagesLoadingMore}>
                {messagesLoadingMore ? <LoadingOne size={13} className="spin" /> : 'Load earlier messages'}
              </button>
            )}
            {messages.map((message) => (
              <div key={message.id} className={`ib-message ${message.direction} ${message.is_draft ? 'draft' : ''}`}>
                <div className="ib-message-meta">
                  <span>{message.direction === 'outbound' ? 'You' : displayContact(selectedThread)}</span>
                  {message.is_draft && <em>Draft</em>}
                </div>
                {message.body_text && <p>{message.body_text}</p>}
                {message.attachments && message.attachments.length > 0 && (
                  <div className="ib-attachments">
                    {message.attachments.map((attachment) => (
                      <button
                        key={attachment.id}
                        type="button"
                        className="ib-attachment-chip"
                        onClick={() => onDownloadAttachment(message.id, attachment)}
                      >
                        <Paperclip size={12} />
                        <span className="ib-attachment-name">{attachment.filename}</span>
                        <span className="ib-attachment-size">{formatAttachmentSize(attachment.size)}</span>
                      </button>
                    ))}
                  </div>
                )}
                <time>{formatDate(message.sent_at)}</time>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
