# Security Policy

## Supported Scope

This repository hosts the public Seshat AI website and private project collateral.
The active supported branch is `main`.

Product security issues for the split repositories should be reported in their own repositories when applicable:

- `SeshatCloud`
- `SeshatOS`
- `seshat`

## Reporting A Vulnerability

Do not open a public GitHub issue for security vulnerabilities.

Use GitHub private vulnerability reporting on the relevant repository, or contact the repository owner directly if private reporting is not available.

Please include:

- the affected repository or website path
- a clear description of the issue
- reproduction steps when possible
- any screenshots, logs, or request examples that help verify impact

## In Scope

For this repository, relevant reports include:

- exposed credentials or private files
- unsafe website dependencies or build configuration
- misconfigured deployment workflows
- cross-site scripting or injection risks in the public website
- accidental publication of private CV or collateral material

## Out Of Scope

- vulnerabilities in third-party AI providers
- issues in old monorepo code removed from this repository
- local-only development files that are not tracked or deployed
- social engineering or phishing reports

## Maintainer Notes

Before publishing changes:

- keep secrets out of Git history and deployment logs
- keep `private/` treated as sensitive by default
- only `private/cvs-specialises/` is intentionally versioned
- verify website builds before merging to `main`
- review generated artifacts before committing them
