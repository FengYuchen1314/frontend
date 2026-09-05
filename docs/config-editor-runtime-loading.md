# Config editor runtime loading

The profile query connector now waits for profile data before selecting the editor
runtime. A Mieru profile mounts the existing editor directly, without creating a
Go runtime, fetching Xray WASM or waiting for its initialization. The same runtime
predicate drives validation/editor setup. Both branches are keyed by profile UUID
so route changes cannot retain another profile's original-value or dirty state.

Xray retains WASM validation. Completion state is updated by asynchronous runtime
callbacks; failed initialization now shows the existing crash/retry UI instead of
silently treating validation as available. Superseded/unmounted generations cannot
report completion or delete another generation's callback. Initialization after
native instantiation has a 30-second readiness deadline. This does not impose a
deadline on the preceding download or terminate an already-running Go instance.

Unit tests cover runtime classification and structurally enforce the loader
boundary and per-profile keys. These are not browser render tests. Type checking
and changed-file lint passed. Actions compilation and the separate blocked-WASM
browser acceptance are recorded below. Existing unrelated full-repository lint
errors are not hidden by this change.

Normal Save now requires a dirty, validated config and an available runtime
(Mieru does not require WASM). Invalid/unavailable Xray validation retains the
upstream Save Anyway confirmation rather than silently enabling normal Save.

## Accepted browser checkpoint — 2026-09-05

Frontend `a0c767388740106c2e87e1841d6b9ff42f83fbd3` passed
[CI 33962077174](https://github.com/FengYuchen1314/frontend/actions/runs/33962077174).
[Paired image 33962077276](https://github.com/FengYuchen1314/backend/actions/runs/33962077276)
passed with backend `6c2105e30df3ac0c46619ec73eb76b9dbf40d19f`, digest
`ghcr.io/fengyuchen1314/backend@sha256:95d4d756e14d507739d535b27ba3f4364a3a9a60bad9489f70e1ea5e03bff41f`.

Only the owned browser panel at `/opt/xboard-panel-test.oKbMNrzT` on
185.99.135.224 was upgraded. A private PostgreSQL dump was saved before migration.
All 2 topologies, 5 complete profiles and 4 hosts were deep-compared before and
after the real production entrypoint upgrade; they were unchanged. The other
container IDs and PDF HTTP 200 were preserved.

The authenticated in-app browser exercised the real deployed frontend through
the existing loopback SSH tunnel. A temporary **private test relay**, not an app
change or browser security override, returned HTTP 503 for `/assets/main.wasm`:

- Direct Mieru navigation mounted the editor and reported valid configuration.
  A reversible whitespace edit enabled normal Save; Undo disabled it again.
- Navigation to a second Mieru profile and back to the cached first profile kept
  the correct name/configuration and clean state. No Xray WASM request reached
  the relay during these Mieru cases.
- Opening an unbound Xray fixture caused an observed 503 and displayed the
  validation-unavailable status. Retry displayed restarting, then returned to a
  recoverable failure after another observed 503.
- A dirty Xray config could not use normal Save while validation was unavailable.
  Save Anyway opened its explicit warning dialog; Cancel performed no save.
- Allowing the real WASM download and clicking Retry on the **same page** restored
  successful validation and enabled normal Save for the pending whitespace edit.
  Undo restored the clean/disabled state. A temporary invalid JSON edit separately
  disabled normal Save, and Undo restored valid configuration.

All test edits were undone without saving, and the original private relay was
restored. This proves the HTTP-failure/retry path, not every possible Go runtime
crash or a hung download. The WASM asset is approximately 59.5 MB; download time
is still unbounded by the editor's post-instantiation readiness deadline.

Private VPS evidence: `editor-a0-upgrade.log`, `editor-a0-preservation.json`,
`editor-a0-before.sql`; browser observations were captured in the task tool log.
A full repository lint rerun reported **15 errors and 11 warnings** in unrelated
existing components; this checkpoint does not claim a clean full-repository lint.

## Encrypted AnyTLS browser follow-up — 2026-09-05

Frontend `1addfa954455333a236abb68d60575e6ed773540` passed
[CI 33964516594](https://github.com/FengYuchen1314/frontend/actions/runs/33964516594)
(42 tests, changed-file lint, type checking and build). Backend `0b5125d1` and this
exact frontend passed
[paired image 33964860911](https://github.com/FengYuchen1314/backend/actions/runs/33964860911):

`ghcr.io/fengyuchen1314/backend@sha256:76f018cab44b52ac110e7fcd57d414362e0ab6f3825f53dbfb6546c9d729ef00`

After a private DB backup, the owned browser panel was upgraded to this pair.
The real UI created `Browser Encrypted AnyTLS` through the existing profile form:
missing camouflage fields and colliding private ports disabled submission.
Successful creation retained empty native Xray inbounds, a strict namespaced
listener and no subscribers, passwords, certificates or insecure overrides.

The editor loaded the real Xray WASM and reported combined structural validity.
A whitespace edit enabled normal Save and Undo disabled it. Invalid JSON and a
JSON-valid extension with version 9 separately blocked normal Save. These drafts
were never saved, and Save Anyway was not used. Public-direct Node selection
included the new TLS/443 AnyTLS/ShadowTLS inbound; leased selection exposed only
Mieru fixtures and residential selection only SOCKS5. No Node or bootstrap
credential was created by these selector checks.

Final API deep comparison preserved every previous topology, complete profile
and host and found exactly the one added AnyTLS profile (6 total). The source
snapshot, SQL backup and private check logs remain in
`/opt/xboard-panel-test.oKbMNrzT`. This checkpoint proves browser structure and
filtering; backend `docs/anytls-managed-creation.md` separately records the real
managed original-installer/native-client/accounting acceptance with this image.
