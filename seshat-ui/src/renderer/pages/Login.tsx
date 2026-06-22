import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/auth/AuthLayout'
import {
  Field, InputWithIcon, EyeToggle, CustomCheckbox,
  PrimaryButton, Divider, OAuthButtons,
  EmailIcon, LockIcon,
} from '@/components/auth/FormPrimitives'
import { useAuth } from '@/hooks/useAuth'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { login } = useAuth()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setError('')
    setLoading(true)
    try {
      await login({ email, password })
      navigate('/', { replace: true })
    } catch (err) {
      setError((err as Error).message || 'Invalid credentials. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to continue to your workspace">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        <Field label="Email">
          <InputWithIcon
            icon={<EmailIcon />}
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="name@email.com"
            autoFocus
            required
          />
        </Field>

        <Field label="Password">
          <div style={{ position: 'relative' }}>
            <InputWithIcon
              icon={<LockIcon />}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={setPassword}
              placeholder="Enter your password"
              required
            />
            <EyeToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
          </div>
        </Field>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <CustomCheckbox checked={rememberMe} onChange={setRememberMe} />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', userSelect: 'none' }}>
              Remember me
            </span>
          </label>
          <button
            type="button"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--brand)', padding: 0 }}
          >
            Forgot password?
          </button>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 8,
            backgroundColor: 'rgba(245,63,63,0.08)',
            border: '1px solid rgba(245,63,63,0.2)',
            color: 'var(--danger)',
            fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <PrimaryButton loading={loading} disabled={!email || !password}>
          Sign in
        </PrimaryButton>

        <Divider />
        <OAuthButtons />

        <p style={{ margin: '8px 0 0', textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ color: 'var(--brand)', textDecoration: 'none', fontWeight: 500 }}>
            Sign up
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
