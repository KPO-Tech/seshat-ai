import type { User } from '@renderer/api/types'
import { ChatWorkspace } from '@renderer/components/chat/ChatWorkspace'

type Props = {
  user: User
}

export function Dashboard({ user }: Props) {
  return <ChatWorkspace user={user} />
}
