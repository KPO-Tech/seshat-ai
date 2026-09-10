import { SKILL_ICON_GROUPS } from '../lib/skillIcons'

type SkillIconPickerProps = {
  pos: { top: number; left: number }
  currentIcon: string
  onSelect: (name: string) => void
  onClose: () => void
}

export function SkillIconPicker({ pos, currentIcon, onSelect, onClose }: SkillIconPickerProps) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={onClose} />
      <div className="sip-panel" style={{ top: pos.top, left: pos.left }}>
        {SKILL_ICON_GROUPS.map((group) => (
          <div key={group.label} className="sip-group">
            <div className="sip-group-label">{group.label}</div>
            <div className="sip-group-icons">
              {group.icons.map(({ name, Icon }) => (
                <button
                  key={name}
                  className={`sip-icon-btn ${name === currentIcon ? 'active' : ''}`}
                  onClick={() => onSelect(name)}
                  aria-label={name}
                >
                  <Icon size={15} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
