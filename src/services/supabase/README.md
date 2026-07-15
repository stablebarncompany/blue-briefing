# Supabase Services

Supabase client setup and data-access helpers for agency-scoped queries.

Use Row Level Security from the beginning. Never embed service-role keys or database passwords in client code. Every operational record must include an `agency_id`.
