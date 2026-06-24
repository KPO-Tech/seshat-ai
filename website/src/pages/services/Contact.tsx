import { useState } from 'react'
import { useInView } from '../../hooks/useInView'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './Contact.module.css'

type Status = 'IDLE' | 'SENDING' | 'SENT' | 'ERROR'

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', organization: '', message: '' })
  const [status, setStatus] = useState<Status>('IDLE')
  const { ref, inView } = useInView(0.1)
  const { t } = useTranslation()
  const { contact: c } = t

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('SENDING')
    const payload = {
      name: form.name,
      email: form.email,
      organization: form.organization || 'Non précisé',
      message: form.message,
      _subject: `[seshat-ai.com] Nouveau projet — ${form.name}`,
      _template: 'table',
      _captcha: 'false',
    }
    try {
      const res = await fetch('https://formsubmit.co/ajax/oastephaneamiche@gmail.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        setStatus('SENT')
        setForm({ name: '', email: '', organization: '', message: '' })
        setTimeout(() => setStatus('IDLE'), 7000)
      } else {
        throw new Error('not ok')
      }
    } catch {
      setStatus('ERROR')
      setTimeout(() => setStatus('IDLE'), 5000)
    }
  }

  return (
    <section className={styles.section} id="contact-section">
      <div className={styles.inner} ref={ref as React.RefObject<HTMLDivElement>}>
        <div className={`${styles.left} reveal ${inView ? 'visible' : ''}`}>
          <p className="section-label">{c.label}</p>
          <h2 className={styles.title}>{c.title}</h2>
          <p className={styles.sub}>{c.sub}</p>

          <div className={styles.pricingPill}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            {c.pricingNote}
          </div>

          <div className={styles.directLinks}>
            <a href="mailto:oastephaneamiche@gmail.com" className={styles.directLink}>
              <div className={styles.linkIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <div>
                <span className={styles.linkLabel}>{c.directEmailLabel}</span>
                <span className={styles.linkValue}>oastephaneamiche@gmail.com</span>
              </div>
            </a>
            <a href="https://github.com/EngineerProjects/seshat/discussions" className={styles.directLink} target="_blank" rel="noreferrer">
              <div className={styles.linkIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div>
                <span className={styles.linkLabel}>{c.discussionLabel}</span>
                <span className={styles.linkValue}>{c.discussionValue}</span>
              </div>
            </a>
          </div>
        </div>

        <div className={`${styles.right} reveal stagger-2 ${inView ? 'visible' : ''}`}>
          {status === 'SENT' ? (
            <div className={styles.successCard}>
              <div className={styles.successIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 className={styles.successTitle}>{c.sent}</h3>
              <p className={styles.successNote}>{c.successNote}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label htmlFor="name" className={styles.label}>{c.fields.name}</label>
                  <input
                    id="name" name="name" type="text" required
                    placeholder={c.fields.namePlaceholder}
                    value={form.name} onChange={handleChange}
                    disabled={status === 'SENDING'}
                    className={styles.input}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="email" className={styles.label}>{c.fields.email}</label>
                  <input
                    id="email" name="email" type="email" required
                    placeholder={c.fields.emailPlaceholder}
                    value={form.email} onChange={handleChange}
                    disabled={status === 'SENDING'}
                    className={styles.input}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="organization" className={styles.label}>{c.fields.organization}</label>
                <input
                  id="organization" name="organization" type="text"
                  placeholder={c.fields.organizationPlaceholder}
                  value={form.organization} onChange={handleChange}
                  disabled={status === 'SENDING'}
                  className={styles.input}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="message" className={styles.label}>{c.fields.message}</label>
                <textarea
                  id="message" name="message" required rows={5}
                  placeholder={c.fields.messagePlaceholder}
                  value={form.message} onChange={handleChange}
                  disabled={status === 'SENDING'}
                  className={`${styles.input} ${styles.textarea}`}
                />
              </div>

              {status === 'ERROR' && (
                <p className={styles.errorNote}>{c.errorNote}</p>
              )}

              <button
                type="submit"
                disabled={status === 'SENDING'}
                className={`${styles.submit} ${status === 'ERROR' ? styles.submitError : ''}`}
              >
                {status === 'SENDING' ? (
                  <span className={styles.sendingInner}>
                    <span className={styles.spinner} />
                    {c.sending}
                  </span>
                ) : (
                  <>
                    {c.send}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
