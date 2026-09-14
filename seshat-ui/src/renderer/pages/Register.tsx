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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
        <div className="rounded-lg border border-app-border-subtle bg-[var(--color-hover)] px-4 py-3.5 text-[13.5px] leading-[1.6] text-[var(--text-secondary)]">
          Self-registration is disabled here. Ask your organization administrator to create an account for you,
          then sign in below.
        </div>
        <p className="m-0 mt-4 text-center text-[13px] text-[var(--text-secondary)]">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-[var(--brand)] no-underline">
            Sign in
          </Link>
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Create your account" subtitle="Start building with SeshatOS today">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

        <Field label="Password">
          <div className="relative">
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

          {password.length > 0 && (
            <div className="mt-2.5 flex flex-col gap-[5px]">
              {requirements.map((req) => (
                <RequirementRow key={req.label} {...req} />
              ))}
            </div>
          )}
        </Field>

        <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-[var(--text-secondary)]">
          <CustomCheckbox checked={agreed} onChange={setAgreed} />
          <span>I agree to the Terms and Privacy Policy</span>
        </label>

        {error && (
          <div className="rounded-lg border border-[rgba(var(--color-error-rgb),0.2)] bg-[rgba(var(--color-error-rgb),0.08)] px-3.5 py-2.5 text-[13px] text-[var(--danger)]">
            {error}
          </div>
        )}

        <PrimaryButton loading={loading} disabled={!canSubmit}>
          Create account
        </PrimaryButton>

        <p className="m-0 mt-2 text-center text-[13px] text-[var(--text-secondary)]">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-[var(--brand)] no-underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}

function RequirementRow({ label, met }: Requirement) {
  return (
    <div className={['flex items-center gap-2', met ? 'text-[var(--success)]' : 'text-[var(--text-secondary)]'].join(' ')}>
      <span
        className={[
          'inline-flex size-4 items-center justify-center rounded-full border text-[11px]',
          met
            ? 'border-[rgba(var(--color-success-rgb),0.28)] bg-[rgba(var(--color-success-rgb),0.14)]'
            : 'border-app-border-subtle bg-[var(--color-hover)]',
        ].join(' ')}
      >
        {met && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none" aria-hidden="true">
            <path d="M1 3.5L3.5 6L8 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span>{label}</span>
    </div>
  )
}
