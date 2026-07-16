# Briefing Attachments

Private operational photo and document attachments for agency-scoped briefings.

## Bucket

- Name: `briefing-attachments`
- Access: **private** (no public read)
- File size limit: **6 MB**
- Allowed MIME types:
  - `image/jpeg`
  - `image/png`
  - `image/webp`
  - `application/pdf`
  - `text/plain`
  - `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

Migration (do not apply from the app):

`supabase/migrations/20260716130000_briefing_attachments.sql`

## Path structure

Exact storage object path:

```text
agency_id/briefing_id/generated-file-name.ext
```

- Uses UUIDs for agency and briefing folders
- Generated filenames only (no email, badge, officer name, case number, or original filename in the path)
- Original filename is stored only in `briefing_attachments.original_filename`

## Metadata table

`public.briefing_attachments` stores:

- briefing/agency linkage
- uploader
- storage path
- original filename, MIME type, size
- attachment type (`image` | `document`)

## Role permissions

| Action | Who |
| --- | --- |
| View attachment metadata | Active agency members |
| Read storage object | Active agency members for matching agency path + briefing |
| Upload | Active agency members; path must start with their agency; briefing must belong to that agency; `uploaded_by = auth.uid()` |
| Delete own metadata/object | Uploader while briefing is `active` |
| Delete any agency attachment | Supervisor / command staff / agency admin |
| Update metadata | Not allowed |

UI hides unauthorized controls. Supabase RLS enforces access.

## Client limits

- Max **6 MB** per file
- Max **10** attachments per briefing
- Photo library permission is requested only when the user taps **Add Photos**

## Signed URL behavior

- Open/download uses short-lived signed URLs (about **10 minutes**)
- Bucket remains private
- Signed URLs are not logged
- Web opens images/documents in a preview modal or new tab
- iOS/Android open documents through an in-app browser / secure link (Expo Go limitation: no full native document viewer guaranteed)

## Upload rollback behavior

1. Upload object to Storage (`upsert: false`)
2. Insert metadata row
3. If metadata insert fails, attempt Storage object removal
4. If Storage upload fails, do not insert metadata

Create-briefing flow:

1. Create briefing once
2. Upload selected attachments
3. On partial failure, keep the briefing ID and remaining failed selections for retry (no duplicate briefing)

## Language / policy

- Files are labeled **operational attachments**, not evidence
- No evidence-chain or end-to-end encryption claims
- Upload UI reminder: follow agency policy before uploading sensitive or evidentiary material

## Current limitations

- No camera capture flow (library/document pickers only)
- No virus scanning or content moderation
- No resumable uploads for larger files
- No attachment editing/versioning
- Thumbnail signed URLs are fetched per image on the details screen (not on list cards)
- Expo Go document opening uses a signed HTTPS link rather than a dedicated native viewer

## Future: resumable uploads

For larger files, consider Supabase resumable/TUS uploads with the same private bucket, path rules, and RLS helpers, plus stronger server-side MIME sniffing and retention policy controls.
