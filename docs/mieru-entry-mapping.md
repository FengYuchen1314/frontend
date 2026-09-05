# Mieru entry / IX mapping workflow

The Host form now provides one-to-one and manual IX-port modes for managed TCP Mieru inbounds.
This keeps the upstream model: Host address/port is the client-facing domestic entry, while
the selected profile inbound owns the actual IX listener. No parallel port database or hidden
listener rewrite is introduced.

- One-to-one resolves a TCP Mieru inbound whose port equals the domestic entry port.
- Manual mode accepts an IX port and selects the matching inbound in the same profile, keeping
  the domestic entry port unchanged. It explicitly tells the operator to configure forwarding.
- Missing, invalid or ambiguous IX listeners block form submission. A link opens the existing
  profile editor; configure the listener there first, then reopen the Host form. Host creation
  does not silently change listeners on other Hosts/servers sharing that profile.
- Existing Hosts infer their initial mode from entry/inbound ports; opening the form does not
  write anything. When both ports are equal, the two modes have identical stored semantics.
- The new mapping controls apply to individual Host creation/editing, not bulk editing. The
  bulk picker's prior behavior of not resetting the port is preserved.

Inbound port defaults now apply only in the explicit picker callback. The old create/edit
watchers are removed so selecting an IX inbound cannot overwrite a separately entered domestic
port. Opening a legacy mapped Host on the previous image retained its port in the tested browser;
this refactor is needed for the new explicit selection path, not a claim that initialization
data loss was reproduced.

Unit tests cover resolution, legacy inference, entry-port preservation, rejected missing/invalid/
ambiguous listeners, form wiring and translations. The paired Actions image and real browser
create/edit/save/reopen tests remain required. No new Agent deployment, domestic forwarding
configuration or live Mieru traffic is claimed by this UI change alone.
