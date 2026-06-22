# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| `main` (latest) | ✅ Active |
| Older tags | ❌ No backports |

---

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Use GitHub's private vulnerability reporting:

1. Go to **Security → Advisories** on the repository page.
2. Click **Report a vulnerability**.
3. Fill in the affected component, a description, and steps to reproduce.
4. Submit — the report is private and visible only to maintainers.

We will acknowledge receipt within **72 hours** and aim to provide a patch within **14 days** for critical issues.

---

## Scope

Security issues we want to know about:

- **Authentication bypass** — ways to access protected endpoints without valid credentials, or to escalate privileges.
- **Session isolation** — ways to read or modify another user's sessions, files, memories, or provider settings.
- **Credential leakage** — API keys, OAuth tokens, or bcrypt hashes exposed in logs, error responses, or API outputs.
- **Injection** — SQL injection, prompt injection through user-supplied content that causes unintended agent actions, or command injection through skill/MCP configurations.
- **CORS misconfiguration** — origins allowed that should not be.
- **Rate limit bypass** — ways to circumvent the per-user rate limiter or quota system.
- **MCP privilege escalation** — malicious MCP server results that cause the agent to exfiltrate data from the host or other users.
- **Admin endpoint exposure** — unauthenticated access to admin-only routes.

Out of scope:

- Vulnerabilities in the underlying LLM providers (report to Anthropic, OpenAI, etc.).
- Issues in `seshat` — report those in the [seshat repository](https://github.com/EngineerProjects/seshat/security/advisories).
- Denial-of-service on single-user local deployments.
- Social engineering or phishing.

---

## Security model

SeshatOS is a **multi-user web application**. The security controls in place:

- **Authentication** — JWT tokens (short-lived) + API keys (prefixed `sk-`, bcrypt-hashed in the DB).
- **Authorization** — role-based (`admin` / user) + group permissions (knowledge, file upload, web search, API keys).
- **Session isolation** — sessions are owned by a user; cross-user access is rejected at the service layer.
- **Encrypted credentials** — provider API keys are AES-encrypted at rest in the database.
- **Password hashing** — bcrypt (cost 12 minimum) for all user passwords. `SESHAT_ADMIN_PASSWORD_HASH` is required in production (plaintext `SESHAT_ADMIN_PASSWORD` is blocked when `SESHAT_ENV=production`).
- **Trusted proxies** — `X-Forwarded-For` is only honoured for IPs in the configured `SESHAT_TRUSTED_PROXIES` CIDR list, preventing IP spoofing.
- **Body size limit** — request bodies are capped at 4 MB (excluding file uploads and SSE streams).
- **Rate limiting** — per-user in-memory fixed-window rate limiter; tighter limit on login endpoints.
- **Audit log** — all auth events, file operations, settings changes, and admin actions are logged.

---

## Production checklist

Before exposing SeshatOS to the internet:

- [ ] Set `SESHAT_ADMIN_PASSWORD_HASH` (bcrypt) — never `SESHAT_ADMIN_PASSWORD` in production.
- [ ] Set `SESHAT_ENV=production` to block plaintext admin passwords at startup.
- [ ] Configure `SESHAT_TRUSTED_PROXIES` if behind a reverse proxy.
- [ ] Set `SESHAT_ALLOWED_ORIGINS` to an explicit origin allowlist (never `*`).
- [ ] Use PostgreSQL or MySQL with a dedicated user for the backend DB.
- [ ] Enable TLS on the reverse proxy — never expose port 8090 directly.
- [ ] Restrict `SESHAT_ENABLE_SIGNUP` to `false` unless open registration is intentional.
- [ ] Review MCP server configurations — only allow servers from trusted sources.

---

## Responsible disclosure

We follow a 90-day responsible disclosure policy. After a fix is shipped, we will publicly disclose the vulnerability in a GitHub Security Advisory with credit to the reporter (unless anonymity is requested).
