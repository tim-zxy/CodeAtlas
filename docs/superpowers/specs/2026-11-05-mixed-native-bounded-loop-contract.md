# Bounded mixed Native control and debugger loop: offline slice

Continues approved D1-D4. No actual launch/debugging/collector/Git/Native or new
rights, production admission, physical formula or runtime numeric choice.
Success: bounded framing queues and pipe workers, serialized control/event loop,
no write/Continue retries, cancellation/deadline/overflow/EOF failures cannot
claim completion, and tests use memory streams plus fake wait/owned operations.

## Bounded mailbox (parallel file owner)

MixedNativeControlMailbox(int maxFrameBytes,long maxTotalBytes,long maxFrames,
int maxQueuedFrames,long maxQueuedBytes), mandatory positive explicit limits.
Feed(byte[],offset,count), CloseInput(), TryTakeInput(out string),
QueueOutput(string), TryTakeOutput(out byte[]), Fail(), Snapshot(). Framing ASCII
TAB/printable and one terminal LF, no CR/BOM. Partial bytes <=frame cap; queues
have explicit frame/byte caps and both directions have independent cumulative
bytes/frame caps. Context/schema/sequence stay in existing policy/codec.
Copies detach buffers; locked methods never call external code. Failure poisons
and clears queues; TryTake returns false/null on failure; EOF drains queued
frames but later Feed refuses. A dequeued output frame is at most one additional
in-flight frame owned by the loop, never an automatic retry lease.

## Pipe workers and loop (root file owner)

Owned distinct input/output Streams are supplied explicitly; no handle creation,
spawn, named pipe/socket or extra OS API. One reader feeds mailbox using a supplied
read-buffer size; one output task at a time writes a detached dequeued frame.
BeginWrite is called once; poll observes completion, never resubmits uncertain
writes. Stop requests disposal once and observes all reader/writer/close workers;
blocked or unobserved workers cannot claim clean shutdown. Stop is bounded at the
loop level; it cannot promise underlying Stream cancellation/unblock.

MixedNativeObserverLoop accepts bridge, mailbox, wait-lane and control-pipe,
explicit polling slice and maximum turns. Only loop thread calls policy/bridge.
Each turn drains bounded queued input, queues policy replies, polls/starts one
write, then waits at most min(slice,remaining). Successful Wait yields next
ordinal from the private Windows wait-lane; timeout does not consume ordinal.
Same deadline/cancellation provider governs normal work and abort/drain; no new
cleanup allowance. Cancellation, transport/policy/OS failure or turn/deadline
exhaustion stops protocol, begins owned-process abort once and drains events only
within remaining budget. No retry of write or uncertain Continue.
Normal completion requires policy/bridge completion, complete EOF, empty queues,
no pending write and observed pipe closure; clean failure remains distinct.
All result execution/production/measurement flags stay false.

Private Windows wait adapter reuses existing WaitForDebugEvent only and the
same required remaining/cancel providers. Existing Node-only Run is untouched.
Live owner/launch/clock/environment/DB/oracle authenticity and actual full-lifetime
resource evidence remain future integration/approval prerequisites. No public
Runtime route or accepted qualification is introduced.

## Parallel integration

Agent owns only new mailbox implementation/unit files and dedicated receipts.
Root owns pipe/loop/Windows partial changes, tests and shared registration/docs.
Reviewer report-only. Join at affected tests/architecture/format and independent
review; no Git/worktree operation or concurrent actual resource collection.

Each turn processes at most the input frame count captured at that turn's start;
subsequent arrivals stay queued. Each frame and each blocking wait recheck the
same remaining/cancel provider, including after Stop. Loop ownership is claimed
atomically once. Stop exceptions are sticky unknown closure even if a pipe port
reports worker completion. No worker error/disposal failure can yield clean.

INFINITE (uint.MaxValue) is rejected for Windows wait arguments/remaining values;
no positive numeric sentinel can silently make a wait unbounded. The private
Windows wait/owned-operation adapters check their construction thread's managed
identity. This is a logical-thread guard, not proof that a real launch/debugger
owner was correct. Real Wait/Continue must still run on the actual launching
thread; control pipe Tasks never own the debugger lane. Microsoft reference:
https://learn.microsoft.com/en-us/windows/win32/api/debugapi/nf-debugapi-waitfordebugevent

A follow-on disjoint Node private adapter may map existing bound-owner take/status
onto the existing Runtime second-argument Source/createNativeLifecycle shape.
It reuses Application's current Source qualifier validation, captures owned
methods and supplies only fixed GIT/V2/V5 callbacks. It cannot invoke Runtime,
spawn, open SQLite or grant execution authority; no public JSON/route changes.

After known HOST/children have all exited/released, healthy loop drains existing
control workers under the same deadline; it no longer waits for new debug events.
Late queued CLOSED/EOF remains valid. Complete EOF with missing close/planned
work refuses immediately. Worker closure and writes must still be observed before
normal completion; a semantic failure can retain independently proved cleanup.
Queue/stream buffering bounds are logical in-process bounds, not an accepted
physical working-set formula. The reader buffer and one detached active write
are explicit extra owned buffers; no zero-cost worker/observer assumption.

CreateQualificationLoop is the single private construction seam: the exact same
remaining provider is passed to event waiting and owned final queries, with one
construction thread for both adapters. It only constructs bridge/pipe/loop and
does not start workers or Run. All queue/read/poll/turn limits remain explicit
caller inputs awaiting exact real-packet approval. Existing Node-only Run and
production routing remain unchanged.
