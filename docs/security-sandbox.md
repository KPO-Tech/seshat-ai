# Security and Sandbox Notes

Seshat Desktop has two separate safety layers that should not be described as
the same thing.

## Permission-Gated Tools

Tool execution is gated by the permission engine. Depending on the configured
permission mode and remembered approvals, the backend can require explicit user
approval before running tools such as shell commands, file edits, browser
automation, MCP tools, and task tools.

This protects user intent and reduces accidental actions, but it is not an
operating-system sandbox by itself.

## OS-Level Sandbox

The runtime can report whether a real OS-level sandbox is active through the
system status endpoint. Release notes and UI copy should only claim sandboxed
execution when that status confirms confinement.

Current practical status:

- Linux can use Landlock when the host/kernel supports it.
- Windows builds currently rely on permission prompts and process isolation, not
  an OS-level filesystem sandbox.
- macOS builds should be treated as unconfined unless a dedicated sandbox layer
  is added and verified.

For release copy, use "permission-gated local tools" unless the packaged app has
been tested with `sandbox_confined=true`.

## Packaging Implications

The Electron app launches a local backend sidecar. The renderer talks to that
sidecar through the Electron main-process proxy after the desktop HMAC
handshake. This is a local trust boundary, not a cloud authentication boundary.

When a default cloud server URL is bundled with `SESHAT_DEFAULT_SERVER_URL`, the
sidecar receives it as `SESHAT_SERVER_URL`. This does not bypass local tool
permissions; it only gives the backend a default remote server to use for
cloud-managed features.

## Release Checklist

- Verify `/api/v1/system/status` and record the sandbox state for each platform.
- Keep permission prompts enabled for risky local tools in release defaults.
- Do not market Windows/macOS local shell execution as sandboxed unless an
  enforced sandbox is implemented and tested there.
- Confirm the sidecar is bundled and starts without developer environment
  variables.
- Confirm `SESHAT_DEFAULT_SERVER_URL` is empty for local-first releases, or set
  deliberately for centrally managed builds.
