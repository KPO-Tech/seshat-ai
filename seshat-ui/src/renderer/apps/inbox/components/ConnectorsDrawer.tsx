import { Close, LoadingOne, Plus } from '@icon-park/react'
import type { ChannelAccount } from '../api/types'
import { CONNECTABLE_CHANNELS, type ConnectableChannelId, channelIcon } from '../lib/inboxDisplay'

type ConnectorsDrawerProps = {
  accounts: ChannelAccount[]
  connectingChannel: string | null
  whatsappPairingActive: boolean
  onClose: () => void
  onConnect: (channel: ConnectableChannelId) => void
}

export function ConnectorsDrawer({
  accounts,
  connectingChannel,
  whatsappPairingActive,
  onClose,
  onConnect,
}: ConnectorsDrawerProps) {
  return (
    <div className="ib-drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="ib-connectors-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Connect an inbox channel"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="ib-drawer-head">
          <div>
            <h2>Connect</h2>
            <span>Channels the Inbox Agent can sync and reply on</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <Close size={14} />
          </button>
        </header>
        <div className="ib-drawer-section">
          {CONNECTABLE_CHANNELS.map((channel) => {
            const connectedCount = accounts.filter((account) => account.channel === channel.id).length
            const isConnecting = channel.id === 'whatsapp' ? whatsappPairingActive : connectingChannel === channel.id
            return (
              <div key={channel.id} className="ib-connector-row">
                <div className="ib-connector-row-icon">{channelIcon(channel.id, 18)}</div>
                <div className="ib-connector-row-copy">
                  <strong>{channel.label}</strong>
                  <span>{channel.description}</span>
                  {connectedCount > 0 && <em>{connectedCount} connected</em>}
                </div>
                <button
                  type="button"
                  className="ib-action-btn"
                  disabled={isConnecting}
                  onClick={() => onConnect(channel.id)}
                >
                  {isConnecting ? <LoadingOne size={13} className="spin" /> : <Plus size={13} />}
                  {connectedCount > 0 ? 'Add another' : 'Connect'}
                </button>
              </div>
            )
          })}
        </div>
      </aside>
    </div>
  )
}
