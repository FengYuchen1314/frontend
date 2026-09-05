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
Two source-structure regression checks fail before this change and pass after it. The Actions
pair backend `3bdbee41463cafc10396e53c37cde7aed6fe6680` / frontend
`c639ce75b8152fb30f784738ed7fbcf62c6f6c6c`, image
`sha256:9ff79bc5c47f0546e2d90242653a1ca07ca2327c3ae0333008741e95308e3544`, passed the VPS
browser regression: modal opens normally, defaults are public-direct/2222, custom name/IP/2444
and broadband type survive next/back, and the broadband profile picker shows only SOCKS.
No node deployment or bootstrap token creation was performed in this form-only regression.

Remaining UI acceptance includes reverse-proxy drafts/conflicts and topology drag/drop,
save/reload and dirty-state behavior. No completed end-to-end UI acceptance is claimed here.

The baseline image also passed reverse-proxy browser save (API readback confirmed the new
revision), explicit not-yet-applied messaging, and preservation of a local draft after a second
editor caused a real HTTP 409. The apply button stayed disabled for the offline test Agent.
The reload-discard warning appeared, but browser automation returned no active dialog handle
after interruption; cancel behavior is therefore unverified, not a claimed pass.

Both distinct physical-server resources were successfully dragged into a new topology draft.
Another finding was verified in the live DOM: `useSortable` attached `role=button` and
`aria-disabled=true` to the fixed ENTRY card. Its native next-hop input was not disabled, but
the ancestor's disabled semantics incorrectly reported its controls as disabled to assistive
tooling; native clicking was still possible. Fixed
ENTRY/EXIT cards now omit the draggable DOM ref; movable cards retain it, and the fixed-node
movement rule is unchanged. A source regression fails before that one-line change. Fresh-image
browser confirmation passed in backend `3bdbee41463cafc10396e53c37cde7aed6fe6680` / frontend
`d6bc1fa1c442572de287d6812241a1218059140e`, image
`sha256:2e0c90900cba2ab4b610f554bd70d830da891f9ce1997a435b6a8b448c54c870`: the entry next-hop
control is enabled and its live DOM has no `aria-disabled=true` ancestor. Both fixed cards appear
as containers, not disabled draggable buttons.

Local tests and type-check pass for the changes. Changed-file lint passes, while whole-tree
lint reports 16 errors and 12 warnings in other files; do not report whole-tree lint as clean.

The baseline browser also completed a two-server chain using actual resource dragging and
next-hop selection: Entry → public Vision Host → broadband SOCKS Host → Exit. Saving created
`Browser Two Server Chain`, version 1. Separate authenticated API readback confirmed two
distinct physical servers, three edges, an unpublished draft and successful server validation.
The browser preview displayed a supported Mihomo injection with the broadband proxy's
`dialer-proxy` set to the public Vision proxy. This verifies graph authoring and preview wiring,
not a complete user subscription or actual client traffic.

## Restart and additional browser checks

Restore after upgrading the panel found the saved graphs gone. This was confirmed by the API
and reproduced in a separate fresh fixture: one saved graph becomes zero after a real container
restart, with the seed log reporting one unknown template deleted. The backend startup seeder
mistakenly deletes the internal topology template type; backend `22e2ce88554470c0448f7818ef5583ea1d3c7047`
corrects this. Earlier images are not safe for deployment despite passing create/read tests.
New-image restart preservation is still required; do not equate a browser refresh with a server restart.

The d6bc frontend passed a second browser-authored graph: both physical-server resources were
dragged into the load-balancer member area, giving two members. Entry connects to both branches,
which feed the balancer and then Exit. Saving `Browser Two Server Balance` persisted five edges.
API readback and the expanded UI preview confirm a supported Mihomo `load-balance` group with
`round-robin` and both proxies. This remains metadata/preview testing, not live client traffic.

Changing the name, clicking New, then cancelling the discard modal preserved the name and graph.
A separate API editor saved version 2; saving the browser's version-1 draft displayed the conflict
warning and kept its unsaved name. Inspection found that the conflict's Reload Latest button
bypassed the existing discard confirmation. It now uses that same guard; a source-wiring regression
fails before this one-line change. Rebuilt-image cancellation/confirmation acceptance is pending.
