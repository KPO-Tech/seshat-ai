import { ApartmentOutlined, CrownOutlined } from '@ant-design/icons'
import { PageHeader } from '@/components/PageHeader'
import { StatTile } from '@/components/StatTile'
import { useAuthStore } from '@/store/auth'

export function WorkspaceOverviewPage() {
  const user = useAuthStore((state) => state.user)
  const organizations = useAuthStore((state) => state.organizations)
  const memberships = useAuthStore((state) => state.memberships)

  return (
    <div>
      <PageHeader
        title="Workspace"
        description="Espace personnel d execution et de validation pour les usages IA reels, distinct de la configuration d organisation et de ton compte."
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
        }}
      >
        <StatTile label="Organizations" value={organizations.length} icon={<ApartmentOutlined />} />
        <StatTile label="Memberships" value={memberships.length} icon={<CrownOutlined />} />
        <StatTile label="Platform Access" value={user?.is_admin ? 'Yes' : 'No'} icon={<CrownOutlined />} />
      </div>
    </div>
  )
}
