import { useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './Contact.module.css'

type Status = 'IDLE' | 'SENDING' | 'SENT' | 'ERROR'

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', organization: '', subject: '', message: '' })
  const [status, setStatus] = useState<Status>('IDLE')
  const { t } = useTranslation()
  const { contact: c } = t

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('SENDING')
    const payload = {
      name: form.name,
      email: form.email,
      organization: form.organization || 'Not specified',
      subject: form.subject || 'General inquiry',
      message: form.message,
      _subject: `[seshat-ai.com] ${form.subject || 'New inquiry'} from ${form.name}`,
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
        setForm({ name: '', email: '', organization: '', subject: '', message: '' })
        setTimeout(() => setStatus('IDLE'), 6000)
      } else {
        throw new Error('Response not ok')
      }
    } catch {
      setStatus('ERROR')
      setTimeout(() => setStatus('IDLE'), 5000)
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.left}>
          <p className="section-label">{c.label}</p>
          <h2 className={styles.title}>{c.title}</h2>
          <p className={styles.sub}>{c.sub}</p>

          <div className={styles.directLinks}>
            <a href="mailto:oastephaneamiche@gmail.com" className={styles.directLink}>
              <div className={styles.linkIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <div>
                <span className={styles.linkLabel}>Email</span>
                <span className={styles.linkValue}>oastephaneamiche@gmail.com</span>
              </div>
            </a>
            <a href="https://github.com/EngineerProjects/seshat/discussions" className={styles.directLink} target="_blank" rel="noreferrer">
              <div className={styles.linkIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

        <div className={styles.right}>
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="name" className={styles.label}>{c.fields.name}</label>
                <input id="name" name="name" type="text" required placeholder={c.fields.namePlaceholder}
                  value={form.name} onChange={handleChange} disabled={status === 'SENDING'} className={styles.input} />
              </div>
              <div className={styles.field}>
                <label htmlFor="email" className={styles.label}>{c.fields.email}</label>
                <input id="email" name="email" type="email" required placeholder={c.fields.emailPlaceholder}
                  value={form.email} onChange={handleChange} disabled={status === 'SENDING'} className={styles.input} />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="organization" className={styles.label}>{c.fields.organization}</label>
                <input id="organization" name="organization" type="text" placeholder={c.fields.organizationPlaceholder}
                  value={form.organization} onChange={handleChange} disabled={status === 'SENDING'} className={styles.input} />
              </div>
              <div className={styles.field}>
                <label htmlFor="subject" className={styles.label}>{c.fields.service}</label>
                <select id="subject" name="subject" required value={form.subject} onChange={handleChange}
                  disabled={status === 'SENDING'} className={`${styles.input} ${styles.select}`}>
                  <option value="" disabled>{c.fields.servicePlaceholder}</option>
                  {c.subjects.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="message" className={styles.label}>{c.fields.message}</label>
              <textarea id="message" name="message" required rows={5} placeholder={c.fields.messagePlaceholder}
                value={form.message} onChange={handleChange} disabled={status === 'SENDING'}
                className={`${styles.input} ${styles.textarea}`} />
            </div>

            <button
              type="submit"
              disabled={status === 'SENDING' || status === 'SENT'}
              className={`${styles.submit} ${status === 'SENT' ? styles.submitSent : ''} ${status === 'ERROR' ? styles.submitError : ''}`}
            >
              {status === 'IDLE' && c.send}
              {status === 'SENDING' && <span className={styles.sending}><span className={styles.spinner} /> {c.sending}</span>}
              {status === 'SENT' && c.sent}
              {status === 'ERROR' && c.error}
            </button>

            {status === 'SENT' && <p className={styles.successNote}>{c.successNote}</p>}
            {status === 'ERROR' && <p className={styles.errorNote}>{c.errorNote}</p>}
          </form>
        </div>
      </div>
    </section>
  )
}
