# Messages Services

Agency-scoped one-to-one direct messages.

- Always pass `currentAgency.id` from AgencyProvider
- Start conversations via `start_direct_conversation` RPC only
- Do not log message bodies, tokens, or secrets
- Not end-to-end encrypted
