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
and changed-file lint are required; Actions compilation and a blocked-WASM browser
test for direct navigation, cached Mieru navigation and the Xray failure/retry path
remain pending. Existing unrelated full-repository lint errors are not hidden by
this change.

Normal Save now requires a dirty, validated config and an available runtime
(Mieru does not require WASM). Invalid/unavailable Xray validation retains the
upstream Save Anyway confirmation rather than silently enabling normal Save.
