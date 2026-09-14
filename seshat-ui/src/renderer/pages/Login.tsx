import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AuthLayout } from '@/components/auth/AuthLayout'
import {
  Field, InputWithIcon, EyeToggle,
  PrimaryButton,
  EmailIcon, LockIcon,
} from '@/components/auth/FormPrimitives'
import { useAuth } from '@/hooks/useAuth'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
      <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
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
          <div className="relative">
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

        {error && (
          <div className="rounded-lg border border-[rgba(var(--color-error-rgb),0.2)] bg-[rgba(var(--color-error-rgb),0.08)] px-3.5 py-2.5 text-[13px] text-[var(--danger)]">
            {error}
          </div>
        )}

        <PrimaryButton loading={loading} disabled={!email || !password}>
          Sign in
        </PrimaryButton>

        <p className="m-0 mt-2 text-center text-[13px] text-[var(--text-secondary)]">
          Don't have an account?{' '}
          <Link to="/register" className="font-medium text-[var(--brand)] no-underline">
            Sign up
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
