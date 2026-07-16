# Briefing Attachments Service

Private operational attachment uploads for agency-scoped briefings.

- Bucket: `briefing-attachments` (private)
- Path: `agency_id/briefing_id/generated-file-name.ext`
- Always pass `currentAgency.id` from AgencyProvider
- Use short-lived signed URLs for open/download
- Do not log file contents, signed URLs, or tokens
