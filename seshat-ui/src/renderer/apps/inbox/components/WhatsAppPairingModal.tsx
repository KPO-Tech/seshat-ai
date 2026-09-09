import { Caution, Close, LoadingOne } from '@icon-park/react'

type WhatsAppPairingModalProps = {
  qr: string | null
  error: string | null
  onCancel: () => void
}

export function WhatsAppPairingModal({ qr, error, onCancel }: WhatsAppPairingModalProps) {
  return (
    <div className="ib-modal-backdrop">
      <div className="ib-modal">
        <h3>Connect WhatsApp</h3>
        <p>Scan this QR code from WhatsApp Settings, Linked Devices, Link a Device.</p>
        {qr ? (
          <img src={qr} alt="WhatsApp pairing QR code" width={260} height={260} />
        ) : error ? (
          <div className="ib-error-banner"><Caution size={13} /> {error}</div>
        ) : (
          <div className="ib-empty"><LoadingOne size={20} className="spin" /></div>
        )}
        <button type="button" className="ib-action-btn" onClick={onCancel}>
          <Close size={13} /> Cancel
        </button>
      </div>
    </div>
  )
}
