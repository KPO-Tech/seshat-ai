import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import styles from './ServicesHero.module.css'

export default function ServicesHero() {
  const [visible, setVisible] = useState(false)
  useEffect(() => { const t = setTimeout(() => setVisible(true), 80); return () => clearTimeout(t) }, [])

  return (
    <section className={styles.hero}>
      <div className={styles.grid}>

        <div className={`${styles.content} reveal ${visible ? 'visible' : ''}`}>
          <span className={styles.badge}>Available for collaborations</span>
          <h1 className={styles.title}>
            Deploy <span className="gradient-text-indigo">AI agent workflows</span><br />
            for your organization
          </h1>
          <p className={styles.sub}>
            I build custom multi-agent systems and automation workflows using Seshat,
            the open-source runtime I created. From architecture to production deployment.
          </p>
          <div className={styles.ctas}>
            <a className={styles.btnPrimary} href="mailto:projectsengineer6@gmail.com">
              Get in touch
            </a>
            <Link className={styles.btnSecondary} to="/">
              About the project
            </Link>
          </div>
        </div>

        <div className={`${styles.illustration} animate-float reveal stagger-2 ${visible ? 'visible' : ''}`}>
          <img
            src="/img/Business Plan-pana.svg"
            alt="AI agent workflow planning illustration"
            className={styles.illustrationImg}
          />
        </div>

      </div>
    </section>
  )
}
