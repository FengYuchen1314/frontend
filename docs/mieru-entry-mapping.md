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
ambiguous listeners, form wiring and translations. All 35 frontend tests, typecheck and
changed-file lint/format checks passed. Whole-repository lint still has the separately recorded
16 errors and 12 warnings; it is not claimed clean.

## Actions image and VPS browser acceptance

Frontend `b40f3d49983ce54134ebb9409fd32bc570835d26` passed
[CI](https://github.com/FengYuchen1314/frontend/actions/runs/33941294326).
The paired [image build](https://github.com/FengYuchen1314/backend/actions/runs/33941329501)
passed with backend `a76166fda8a5a1f2d2b41dc0b5abf27357e4af66` and that exact frontend revision:

`ghcr.io/fengyuchen1314/backend@sha256:15ae7bc863d281f7b4db9900d34f1f4dfd0a6d25ff5548713eb206054ff473fe`

The image metadata was checked before upgrading the isolated panel fixture on `185.99.135.224`.
No frontend/backend code was compiled locally or on the VPS. Browser access used a loopback SSH
tunnel; the fixture has no public host ports. Test Hosts are disabled and use documentation IPs.

Actual browser create/edit/save/reopen plus authenticated API readback passed:

- A new Host selected a profile with existing TCP Mieru listeners at 24443 and 34443.
- Manual domestic entry 34444 with nonexistent IX 50000 displayed an error and disabled a
  previously enabled Save button. Selecting IX 34443 selected the corresponding inbound while
  retaining domestic entry 34444. Saving and reopening retained manual mode and both ports.
- Changing to one-to-one first rejected unmatched entry 34444. Entry 34443 then saved as
  `34443 -> 34443`; reopening selected one-to-one mode with a pristine, disabled Save button.
- Changing back to manual and selecting IX 24443 retained entry 34443, selected the other inbound,
  and saved as `34443 -> 24443`. Reopening retained that manual mapping.
- API readback after every save matched the expected Host port and actual inbound reference.
  The complete shared profile response, including both listeners, remained unchanged.
- After an actual panel-container restart, the saved manual mapping and shared profile remained
  intact. Both saved topology records matched their pre-upgrade snapshot exactly, including
  versions, publication flags and graph contents.

The existing legacy Host with different entry/IX ports was also unchanged by opening the older
UI and by the paired image upgrade. No existing runtime node was associated with these new test
listeners. The PDF endpoint returned HTTP 200 and both PDF containers remained healthy.

This accepts the individual Host mapping workflow, not automatic IX listener creation, domestic
forwarding configuration, Agent deployment or live Mieru client traffic. Those integration checks
remain separate from this UI change.
