// Browsers heuristically treat any text input immediately followed by a
// password input as a login form and offer to fill it from saved
// credentials - on a single-origin app like this console, that means the
// user's own login email/password end up autofilled into unrelated
// settings forms (provider/embedder/web-search credentials). These hidden
// decoy fields, placed first inside the <Form>, give the browser something
// else to latch onto instead of the real fields below them.
export function AutofillGuard() {
  return (
    <div aria-hidden style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <input type="text" name="username" autoComplete="username" tabIndex={-1} />
      <input type="password" name="password" autoComplete="new-password" tabIndex={-1} />
    </div>
  )
}
