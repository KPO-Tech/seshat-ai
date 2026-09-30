import { Tag, Tooltip } from 'antd'
import { CloudOutlined, GiftOutlined, UserOutlined } from '@ant-design/icons'
import { useAuthStore } from '@/store/auth'
import type { BundleProvenanceEntry } from '@/api/bundles'

// ProvenanceTag — Etape B5 of
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 7 sous-chantier
// B: the three provenance signals a row on any of the four registry pages
// can carry, in priority order. "platform" (an inherited default-org row,
// read-only here) always wins since it's structurally different from
// anything this organization owns; a bundle import and "created by me" are
// mutually exclusive by construction (Import always sets created_by_user_id
// to whoever ran the import, but the bundle tag is more specific/useful).
// Renders nothing for a row created directly by someone else in the
// organization — there's no fourth signal to show for that case.
export function ProvenanceTag({
  createdByUserId,
  source,
  provenance,
}: {
  createdByUserId?: string
  source?: string
  provenance?: BundleProvenanceEntry
}) {
  const currentUserId = useAuthStore((s) => s.user?.id)

  if (source === 'platform') {
    return (
      <Tag icon={<CloudOutlined />} color="default">
        Platform default
      </Tag>
    )
  }
  if (provenance?.bundle_name) {
    return (
      <Tooltip title={`Created by importing the "${provenance.bundle_name}" bundle`}>
        <Tag icon={<GiftOutlined />} color="purple">
          {provenance.bundle_name}
        </Tag>
      </Tooltip>
    )
  }
  if (createdByUserId && currentUserId && createdByUserId === currentUserId) {
    return (
      <Tag icon={<UserOutlined />} color="blue">
        Created by me
      </Tag>
    )
  }
  return null
}
