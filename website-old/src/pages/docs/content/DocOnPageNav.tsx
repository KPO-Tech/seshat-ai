import styles from './DocOnPageNav.module.css'

type DocOnPageNavItem = {
  id: string
  label: string
}

type DocOnPageNavProps = {
  title?: string
  items: DocOnPageNavItem[]
}

export default function DocOnPageNav({ title = 'On this page', items }: DocOnPageNavProps) {
  return (
    <nav className={styles.nav} aria-label={title}>
      <div className={styles.title}>{title}</div>
      <ul className={styles.list}>
        {items.map(item => (
          <li key={item.id}>
            <a className={styles.link} href={`#${item.id}`}>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
