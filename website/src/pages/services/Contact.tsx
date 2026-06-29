import { useState } from 'react'
import { useInView } from '../../hooks/useInView'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './Contact.module.css'

type Status = 'IDLE' | 'SENDING' | 'SENT' | 'ERROR'

type Content = {
  label: string
  title: string
  sub: string
  discussionLabel: string
  discussionValue: string
  fields: {
    name: string
    namePlaceholder: string
    email: string
    emailPlaceholder: string
    organization: string
    organizationPlaceholder: string
    message: string
    messagePlaceholder: string
  }
  send: string
  sending: string
  sent: string
  successNote: string
  errorNote: string
}

const EN: Content = {
  label: 'Contact',
  title: 'Tell me which workflow to automate first.',
  sub: 'Describe the first workflow you want to improve: documents, knowledge, finance, support, or back-office. That is the fastest way to see whether there is a serious pilot worth deploying.',
  discussionLabel: 'GitHub Discussions',
  discussionValue: 'Public runtime discussion remains open',
  fields: {
    name: 'Name *',
    namePlaceholder: 'Your name',
    email: 'Email *',
    emailPlaceholder: 'your@email.com',
    organization: 'Organization',
    organizationPlaceholder: 'Your company (optional)',
    message: 'Workflow to improve *',
    messagePlaceholder: 'Describe the workflow, the current bottlenecks, the systems involved, the review points that must stay human, and the result you want to obtain first.',
  },
  send: 'Send',
  sending: 'Sending...',
  sent: 'Message received!',
  successNote: 'I will get back to you within 48 hours.',
  errorNote: 'Something went wrong. Email me directly: oastephaneamiche@gmail.com',
}

const FR: Content = {
  label: 'Contact',
  title: 'Dis-moi quel workflow tu veux automatiser en premier.',
  sub: 'Decris le premier workflow que tu veux ameliorer : documents, connaissance, finance, support ou back-office. C est la maniere la plus rapide de voir s il existe un pilote serieux a deployer.',
  discussionLabel: 'GitHub Discussions',
  discussionValue: 'La discussion publique autour du runtime reste ouverte',
  fields: {
    name: 'Nom *',
    namePlaceholder: 'Votre nom',
    email: 'Email *',
    emailPlaceholder: 'votre@email.com',
    organization: 'Organisation',
    organizationPlaceholder: 'Votre entreprise (optionnel)',
    message: 'Workflow a ameliorer *',
    messagePlaceholder: 'Decrivez le workflow, les points de blocage actuels, les systemes impliques, les points de revue qui doivent rester humains et le premier resultat vise.',
  },
  send: 'Envoyer',
  sending: 'Envoi...',
  sent: 'Message recu !',
  successNote: 'Je vous repondrai dans les 48 heures.',
  errorNote: 'Une erreur s est produite. Contactez-moi directement : oastephaneamiche@gmail.com',
}

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', organization: '', message: '' })
  const [status, setStatus] = useState<Status>('IDLE')
  const { ref, inView } = useInView(0.1)
  const { lang } = useTranslation()
  const content = lang === 'fr' ? FR : EN

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('SENDING')
    const payload = {
      name: form.name,
      email: form.email,
      organization: form.organization || (lang === 'fr' ? 'Non precise' : 'Not specified'),
      message: form.message,
      _subject: `[seshat-ai.com] Workflow inquiry — ${form.name}`,
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
          <p className="section-label">{content.label}</p>
          <h2 className={styles.title}>{content.title}</h2>
          <p className={styles.sub}>{content.sub}</p>

          <div className={styles.directLinks}>
            <a href="mailto:oastephaneamiche@gmail.com" className={styles.directLink}>
              <div className={styles.linkIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <div>
                <span className={styles.linkLabel}>Email</span>
                <span className={styles.linkValue}>oastephaneamiche@gmail.com</span>
              </div>
            </a>
            <a href="https://github.com/KPO-Tech/seshat/discussions" className={styles.directLink} target="_blank" rel="noreferrer">
              <div className={styles.linkIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div>
                <span className={styles.linkLabel}>{content.discussionLabel}</span>
                <span className={styles.linkValue}>{content.discussionValue}</span>
              </div>
            </a>
          </div>
        </div>

        <div className={`${styles.right} reveal stagger-2 ${inView ? 'visible' : ''}`}>
          {status === 'SENT' ? (
            <div className={styles.successCard}>
              <div className={styles.successIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h3 className={styles.successTitle}>{content.sent}</h3>
              <p className={styles.successNote}>{content.successNote}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label htmlFor="name" className={styles.label}>{content.fields.name}</label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    placeholder={content.fields.namePlaceholder}
                    value={form.name}
                    onChange={handleChange}
                    disabled={status === 'SENDING'}
                    className={styles.input}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="email" className={styles.label}>{content.fields.email}</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    placeholder={content.fields.emailPlaceholder}
                    value={form.email}
                    onChange={handleChange}
                    disabled={status === 'SENDING'}
                    className={styles.input}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="organization" className={styles.label}>{content.fields.organization}</label>
                <input
                  id="organization"
                  name="organization"
                  type="text"
                  placeholder={content.fields.organizationPlaceholder}
                  value={form.organization}
                  onChange={handleChange}
                  disabled={status === 'SENDING'}
                  className={styles.input}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="message" className={styles.label}>{content.fields.message}</label>
                <textarea
                  id="message"
                  name="message"
                  required
                  rows={5}
                  placeholder={content.fields.messagePlaceholder}
                  value={form.message}
                  onChange={handleChange}
                  disabled={status === 'SENDING'}
                  className={`${styles.input} ${styles.textarea}`}
                />
              </div>

              {status === 'ERROR' && <p className={styles.errorNote}>{content.errorNote}</p>}

              <button
                type="submit"
                disabled={status === 'SENDING'}
                className={`${styles.submit} ${status === 'ERROR' ? styles.submitError : ''}`}
              >
                {status === 'SENDING' ? (
                  <span className={styles.sendingInner}>
                    <span className={styles.spinner} />
                    {content.sending}
                  </span>
                ) : (
                  <>
                    {content.send}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="5" y1="12" x2="19" y2="12"/>
                      <polyline points="12 5 19 12 12 19"/>
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
