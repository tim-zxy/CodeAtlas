# Private before-spawn and fixed-role offline handshake batch

Authority: user-approved D1-D4 offline implementation and exact second-slice
contract. Assumptions: single code writer; only explicit trusted deep-private
callers receive hooks; no public production admission, OS rights or live run.

1. Preserve pre-change sources and write refusal/order/deadline/cleanup tests.
2. Add optional Native pre-spawn gate and explicit private Source qualification
   plumbing, with original pipes/readers/budgets/close ownership preserved.
3. Add fixed ordered one-shot offline handshake adapter; no transport or collector.
4. Build only changed TypeScript packages and necessary dependents, run focused
   fake-process tests plus existing affected compatibility tests, architecture
   and scoped formatting; independent review before claiming bounded completion.
5. Save receipts and remaining complete-batch approval prerequisites; continue
   independent offline work where concrete and compatible. No actual sampling.
