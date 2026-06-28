# Improvement Report

Command: gated `*improve` after `*diagnose`  
Status: Applied

## Changes Applied

- Added word-boundary matching for short classifier terms.
- Added pet keywords and `household.pets` handling.
- Added safety need tagging for suicide/overdose crisis language.
- Added explicit emergency handoffs for critical medication/equipment interruption.
- Narrowed dialysis escalation to missed/unreachable dialysis, not ordinary appointment transport.
- Added eligibility gating for veteran, youth, disability, pet, and domestic-violence resources.
- Added `medical` and `medical device` to medical need vocabulary.
- Strengthened dataset safety coverage for the `*risk-drill` extension.

## Before

- Initial scorecard: 17/24 cases, 161/168 checks, FAIL.
- Risk drill: FAIL, safety coverage 2/3.

## After

- Unit tests: 3/3 PASS.
- Risk drill: PASS, all coverage floors met.
- Final scorecard: 24/24 cases, 168/168 checks, PASS.
