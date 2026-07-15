# Blue Briefing Foundation

This document defines the product purpose, navigation, roles, security principles, visual direction, and engineering standards for the Blue Briefing application. It is the reference for early project scaffolding. No working features are implied by this document alone.

## 1. Product Purpose

Blue Briefing is a secure agency communication platform for law enforcement shift pass-ons, groups, direct messaging, alerts, acknowledgements, agency resources, and personnel administration.

## 2. MVP Navigation

Primary destinations:

- Home
- Briefings
- Groups
- Messages
- More

Navigation patterns:

- **Desktop / wide layouts:** sidebar navigation
- **Mobile:** bottom tab navigation

## 3. Initial User Roles

- Agency Administrator
- Command Staff
- Supervisor
- Officer
- Dispatcher
- Civilian Staff

## 4. Security Principles

- Every user belongs to an agency.
- Every operational database record must include an `agency_id`.
- Users only access data for agencies and groups they are authorized to access.
- Use role-based permissions.
- Use Supabase Row Level Security from the beginning.
- Never place service-role keys or database passwords in client code.
- Maintain audit logs for sensitive actions.
- Do not claim end-to-end encryption unless it is actually implemented.

## 5. Visual Direction

- Dark navy background
- Bright blue primary actions
- White headings
- Muted slate secondary text
- Green security indicators
- Thin borders
- Spacious cards
- Professional public-safety appearance
- Responsive web, iOS, and Android support

## 6. Engineering Standards

- TypeScript only
- Expo Router
- Reusable components
- Centralized theme values
- No hardcoded colors inside screens
- Small focused files
- Avoid duplicate logic
- Preserve web and mobile compatibility
- Keep the project compiling after every change

## Out of Scope for Foundation Setup

The following are intentionally deferred:

- Supabase credentials and client configuration
- Authentication logic
- Database tables and migrations
- Application feature screens beyond the existing Expo starter
