export type User = {
  id: string
  email: string
  display_name: string
  status: string
}

export type LoginRequest = {
  email: string
  password: string
}

export type RegisterRequest = {
  name: string
  email: string
  password: string
}

export type LoginResponse = {
  token: string
  expires_at: string
  user: User
  roles: string[]
}

export type AuthSession = {
  user: User
  roles: string[]
  isAuthenticated: boolean
}

export type SystemStatus = {
  mode: 'standalone' | 'connected'
  server_url?: string
}
