import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './ServicesHero.module.css'

export default function ServicesHero() {
  const [visible, setVisible] = useState(false)
  const { t, linkTo } = useTranslation()
  useEffect(() => { const t = setTimeout(() => setVisible(true), 80); return () => clearTimeout(t) }, [])

  return (
    <section className={styles.hero}>
      <div className={styles.grid}>
        <div className={`${styles.content} reveal ${visible ? 'visible' : ''}`}>
          <span className={styles.badge}>{t.servicesHero.badge}</span>
          <h1 className={styles.title}>
            {t.servicesHero.title1} <span className="gradient-text-indigo">{t.servicesHero.titleHighlight}</span><br />
            {t.servicesHero.title2}
          </h1>
          <p className={styles.sub}>{t.servicesHero.sub}</p>
          <div className={styles.ctas}>
            <a className={styles.btnPrimary} href="mailto:oastephaneamiche@gmail.com">
              {t.servicesHero.getInTouch}
            </a>
            <Link className={styles.btnSecondary} to={linkTo('/')}>
              {t.servicesHero.aboutProject}
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
