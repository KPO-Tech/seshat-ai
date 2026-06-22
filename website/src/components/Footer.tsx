import { Link } from 'react-router-dom'
import styles from './Footer.module.css'

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.links}>
        <a href="https://github.com/EngineerProjects/seshat" target="_blank" rel="noreferrer">seshat (engine)</a>
        <a href="https://github.com/EngineerProjects/seshat-ai" target="_blank" rel="noreferrer">seshat-ai (platform)</a>
        <a href="https://github.com/EngineerProjects/seshat/discussions" target="_blank" rel="noreferrer">Discussions</a>
        <a href="https://github.com/EngineerProjects/seshat/issues" target="_blank" rel="noreferrer">Issues</a>
        <Link to="/services">Services</Link>
      </div>
      <p className={styles.copy}>
        © 2026 Seshat ·{' '}
        <a href="https://github.com/EngineerProjects/seshat" target="_blank" rel="noreferrer">
          Open Source · Apache 2.0
        </a>
      </p>
    </footer>
  )
}
