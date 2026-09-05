# Paired panel browser acceptance

The 2026-09-05 VPS fixture pairs backend `9ce0671f2ff3d1812554745b169d3389d3203e7f`
with frontend `5df763b7e151d8a9247f2bed3d862621fc360016` in Actions image
`sha256:44e5a1bdd2ccd83708eb75be751da7cc101d0fa5b638b0d05d2775b0ae0c400b`.
The unmodified image starts against a fresh private database; the browser reaches it over a
loopback-bound SSH tunnel. No production service or public HTTPS listener is replaced.

Login and the dashboard render successfully. After user authorization for the first-login
license confirmation, opening the create-server modal reliably reaches the React error boundary
with [error 185](https://react.dev/errors/185) (maximum update depth exceeded).
The modal initializes defaults in an effect depending on the entire `form` object. Mantine
returns a new form object each render, and uncontrolled `setValues` changes input keys even
when the supplied defaults have not changed. The effect repeatedly triggers another render.

The correction puts port `2222` and server type `PUBLIC_DIRECT` in `initialValues` and removes
the resetting effect. User-entered values and server-type selections are not reset on renders.
Two source-structure regression checks fail before this change and pass after it. They are not
a replacement for browser rendering: rebuild the exact frontend/backend pair in Actions and
retest modal opening, typed values, server-type changes and returning from the next step.

Remaining UI acceptance includes reverse-proxy drafts/conflicts and topology drag/drop,
save/reload and dirty-state behavior. No completed end-to-end UI acceptance is claimed here.
