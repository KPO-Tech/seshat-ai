import { useState } from 'react'
import styles from './Contact.module.css'

type Status = 'IDLE' | 'SENDING' | 'SENT' | 'ERROR'

const SUBJECT_OPTIONS = [
  'Custom agent team deployment',
  'Automation workflow',
  'Seshat SDK integration',
  'Multi-agent architecture advisory',
  'Production deployment',
  'Other',
]

export default function Contact() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    organization: '',
    subject: '',
    message: '',
  })
  const [status, setStatus] = useState<Status>('IDLE')

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
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
      const res = await fetch('https://formsubmit.co/ajax/projectsengineer6@gmail.com', {
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
          <p className="section-label">Contact</p>
          <h2 className={styles.title}>Let's talk</h2>
          <p className={styles.sub}>
            Describe your use case briefly. I read every message and reply within 48 hours.
          </p>

          <div className={styles.directLinks}>
            <a href="mailto:projectsengineer6@gmail.com" className={styles.directLink}>
              <div className={styles.linkIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <div>
                <span className={styles.linkLabel}>Email</span>
                <span className={styles.linkValue}>projectsengineer6@gmail.com</span>
              </div>
            </a>
            <a
              href="https://github.com/EngineerProjects/seshat/discussions"
              className={styles.directLink}
              target="_blank"
              rel="noreferrer"
            >
              <div className={styles.linkIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div>
                <span className={styles.linkLabel}>GitHub Discussions</span>
                <span className={styles.linkValue}>Public conversation welcome</span>
              </div>
            </a>
          </div>
        </div>

        <div className={styles.right}>
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="name" className={styles.label}>Name *</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  placeholder="Your name"
                  value={form.name}
                  onChange={handleChange}
                  disabled={status === 'SENDING'}
                  className={styles.input}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="email" className={styles.label}>Email *</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="your@email.com"
                  value={form.email}
                  onChange={handleChange}
                  disabled={status === 'SENDING'}
                  className={styles.input}
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="organization" className={styles.label}>Organization</label>
                <input
                  id="organization"
                  name="organization"
                  type="text"
                  placeholder="Your company (optional)"
                  value={form.organization}
                  onChange={handleChange}
                  disabled={status === 'SENDING'}
                  className={styles.input}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="subject" className={styles.label}>Service *</label>
                <select
                  id="subject"
                  name="subject"
                  required
                  value={form.subject}
                  onChange={handleChange}
                  disabled={status === 'SENDING'}
                  className={`${styles.input} ${styles.select}`}
                >
                  <option value="" disabled>Select a service</option>
                  {SUBJECT_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="message" className={styles.label}>Message *</label>
              <textarea
                id="message"
                name="message"
                required
                rows={5}
                placeholder="Describe your use case, stack, constraints, and what you want to achieve..."
                value={form.message}
                onChange={handleChange}
                disabled={status === 'SENDING'}
                className={`${styles.input} ${styles.textarea}`}
              />
            </div>

            <button
              type="submit"
              disabled={status === 'SENDING' || status === 'SENT'}
              className={`${styles.submit} ${status === 'SENT' ? styles.submitSent : ''} ${status === 'ERROR' ? styles.submitError : ''}`}
            >
              {status === 'IDLE' && 'Send message'}
              {status === 'SENDING' && (
                <span className={styles.sending}>
                  <span className={styles.spinner} /> Sending...
                </span>
              )}
              {status === 'SENT' && 'Message sent!'}
              {status === 'ERROR' && 'Failed, try again'}
            </button>

            {status === 'SENT' && (
              <p className={styles.successNote}>
                I will get back to you within 48 hours.
              </p>
            )}
            {status === 'ERROR' && (
              <p className={styles.errorNote}>
                Something went wrong. Email me directly at projectsengineer6@gmail.com
              </p>
            )}
          </form>
        </div>
      </div>
    </section>
  )
}
