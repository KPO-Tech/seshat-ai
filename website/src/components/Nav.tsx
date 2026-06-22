import { NavLink } from 'react-router-dom'
import styles from './Nav.module.css'

export default function Nav() {
  return (
    <nav className={styles.nav}>
      <NavLink to="/" className={styles.logo}>
        <img src="/seshat.png" alt="Seshat" className={styles.logoImg} />
        <span className={styles.logoText}>Seshat</span>
      </NavLink>

      <div className={styles.links}>
        <NavLink
          to="/"
          className={({ isActive }) => isActive ? `${styles.link} ${styles.active}` : styles.link}
          end
        >
          Home
        </NavLink>
        <NavLink
          to="/services"
          className={({ isActive }) => isActive ? `${styles.link} ${styles.active}` : styles.link}
        >
          Services
        </NavLink>
        <a href="https://github.com/EngineerProjects/seshat" className={styles.link} target="_blank" rel="noreferrer">
          GitHub
        </a>
        <a
          href="https://github.com/EngineerProjects/seshat/discussions"
          className={styles.cta}
          target="_blank"
          rel="noreferrer"
        >
          Discussions
        </a>
      </div>
    </nav>
  )
}
