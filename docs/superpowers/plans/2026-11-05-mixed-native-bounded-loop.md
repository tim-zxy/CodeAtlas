# Offline bounded loop plan

1. Freeze mailbox/pipe/wait/loop interfaces and disjoint file ownership.
2. Parallel mailbox framing/budget TDD; root pipe/loop memory/fake TDD.
3. Compile private Windows wait adapter only, preserving old Run.
4. Join regression, independent review and targeted fixes; reuse prior TS builds.
5. Update status/trace and consolidated actual-run prerequisite list; continue
   next independent approved work only when scope/interfaces are concrete.
