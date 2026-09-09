import type { Thread, ThreadMessage } from '../api/types'
import { displayContact, formatDate } from './inboxDisplay'

export function buildInboxAgentPrompt(thread: Thread | null, messages: ThreadMessage[]): string {
  if (!thread) {
    return [
      'Open the Inbox Agent.',
      '',
      'Please review my connected inbox accounts, list the open threads that need attention, and suggest the next triage actions.',
      'Prefer drafts over sending. Do not send any message unless I explicitly confirm the final text.',
    ].join('\n')
  }

  const recentMessages = messages.slice(-12).map((message) => {
    const author = message.direction === 'outbound' ? 'Me' : displayContact(thread)
    const draft = message.is_draft ? ' draft' : ''
    const attachments = message.attachments?.length
      ? ` Attachments: ${message.attachments.map((attachment) => attachment.filename).join(', ')}.`
      : ''
    return `- ${author}${draft} at ${formatDate(message.sent_at)}: ${message.body_text || '(no text)'}${attachments}`
  })

  return [
    'Open the Inbox Agent on this specific thread.',
    '',
    `Thread ID: ${thread.id}`,
    `Channel: ${thread.channel}`,
    `Contact: ${displayContact(thread)}`,
    `Subject: ${thread.subject || '(none)'}`,
    `Current status: ${thread.status}`,
    `Priority score: ${thread.priority_score.toFixed(2)}`,
    '',
    'Task:',
    '1. Read the canonical thread with inbox_get_thread before making recommendations.',
    '2. Summarize the situation and identify the next best action.',
    '3. If a reply is appropriate, draft it with inbox_draft_reply. Do not send it unless I explicitly confirm.',
    '',
    'Visible recent messages from the UI:',
    recentMessages.length > 0 ? recentMessages.join('\n') : '(no messages loaded in the UI yet)',
  ].join('\n')
}
