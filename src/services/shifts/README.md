# Shifts service

Agency shift catalog and personnel assignment client API.

- Reads use RLS-scoped selects on `agency_shifts`, `personnel_shift_assignments`, and `shift_supervisors`.
- Writes use SECURITY DEFINER RPCs only.
- Throws `ShiftServiceError` on failures; does not return empty arrays for failed queries.

See `docs/ShiftsAndAssignmentsMVP.md`.
