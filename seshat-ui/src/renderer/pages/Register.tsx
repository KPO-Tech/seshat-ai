import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AuthLayout } from '@/components/auth/AuthLayout'
import {
  Field, InputWithIcon, EyeToggle, CustomCheckbox,
  PrimaryButton,
  EmailIcon, LockIcon,
} from '@/components/auth/FormPrimitives'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { LoginResponse } from '@/api/types'

type SystemStatus = { mode: 'standalone' | 'connected'; server_url?: string }

type Requirement = { label: string; met: boolean }

function getRequirements(password: string): Requirement[] {
  return [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Contains a number', met: /\d/.test(password) },
    { label: 'Contains an uppercase letter', met: /[A-Z]/.test(password) },
  ]
}

function PersonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M20 21a8 8 0 1 0-16 0" />
    </svg>
  )
}

export function Register() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [registrationDisabled, setRegistrationDisabled] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api.get<SystemStatus>('/system/status')
      .then((status) => setRegistrationDisabled(status.mode === 'connected'))
      .catch(() => setRegistrationDisabled(false))
  }, [])

  const requirements = getRequirements(password)
  const allMet = requirements.every((r) => r.met)
  const canSubmit = name.trim() && email && allMet && agreed

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError('')
    setLoading(true)
    try {
      if (window.nexus?.auth) {
        const session = await window.nexus.auth.register({
          name: name.trim(),
          email,
          password,
        })
        useAuthStore.getState().setSession(session)
      } else {
        const res = await api.post<LoginResponse>('/auth/register', {
          name: name.trim(),
          email,
          password,
        })
        useAuthStore.getState().setSession({ user: res.user, roles: res.roles ?? [], isAuthenticated: true }, res.token)
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError((err as Error).message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (registrationDisabled) {
    return (
      <AuthLayout title="Account creation is managed by your organization" subtitle="This workspace is connected to a Seshat Server">
        <div style={{
          padding: '14px 16px',
          borderRadius: 8,
          backgroundColor: 'var(--color-hover)',
          border: '1px solid var(--color-border-subtle)',
          color: 'var(--text-secondary)',
          fontSize: 13.5,
          lineHeight: 1.6,
        }}>
          Self-registration is disabled here. Ask your organization administrator to create an account for you,
          then sign in below.
        </div>
        <p style={{ margin: '16px 0 0', textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--brand)', textDecoration: 'none', fontWeight: 500 }}>
            Sign in
          </Link>
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Create your account" subtitle="Start building with SeshatOS today">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Full name */}
        <Field label="Full name">
          <InputWithIcon
            icon={<PersonIcon />}
            type="text"
            value={name}
            onChange={setName}
            placeholder="Your full name"
            autoFocus
            required
          />
        </Field>

        {/* Email */}
        <Field label="Email">
          <InputWithIcon
            icon={<EmailIcon />}
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="name@email.com"
            required
          />
        </Field>

        {/* Password */}
        <Field label="Password">
          <div style={{ position: 'relative' }}>
            <InputWithIcon
              icon={<LockIcon />}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={setPassword}
              placeholder="Create a password"
              required
            />
            <EyeToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
          </div>

          {/* Requirements */}
          {password.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
              {requirements.map((req) => (
                <RequirementRow key={req.label} {...req} />
              ))}
            </div>
          )}
        </Field>

        {/* Terms */}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
          <CustomCheckbox checked={agreed} onChange={setAgreed} />
          <span>I agree to the Terms and Privacy Policy</span>
        </label>

        {error && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 8,
            backgroundColor: 'rgba(var(--color-error-rgb), 0.08)',
            border: '1px solid rgba(var(--color-error-rgb), 0.2)',
            color: 'var(--danger)',
            fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <PrimaryButton loading={loading} disabled={!canSubmit}>
          Create account
        </PrimaryButton>

        <p style={{ margin: '8px 0 0', textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--brand)', textDecoration: 'none', fontWeight: 500 }}>
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}

function RequirementRow({ label, met }: Requirement) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: met ? 'var(--success)' : 'var(--text-secondary)' }}>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        borderRadius: 999,
        fontSize: 11,
        background: met ? 'rgba(var(--color-success-rgb), 0.14)' : 'var(--color-hover)',
        border: met ? '1px solid rgba(var(--color-success-rgb), 0.28)' : '1px solid var(--color-border-subtle)',
      }}>{met ? '✓' : ''}</span>
      <span>{label}</span>
    </div>
  )
}
