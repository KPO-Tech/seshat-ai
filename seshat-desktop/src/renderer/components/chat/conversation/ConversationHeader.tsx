import { ChatTopBar } from '@renderer/components/chat/ChatTopBar'

// ChatTopBar is shared with pages/Home.tsx (new-conversation composer), so it
// stays at the chat/ root instead of moving in here. This wrapper only owns
// the conversation page's own "top bar" slot/layout around it.
type ConversationHeaderProps = Parameters<typeof ChatTopBar>[0]

export function ConversationHeader(props: ConversationHeaderProps) {
  return (
    <div className="conv-top-bar">
      <ChatTopBar {...props} />
    </div>
  )
}
