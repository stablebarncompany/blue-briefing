/**
 * Hand-maintained notification domain types aligned to the SQL migration.
 */

export const NOTIFICATION_TYPES = [
  'critical_briefing',
  'briefing_created',
  'briefing_updated',
  'briefing_ack_required',
  'group_post',
  'group_reply',
  'group_mention',
  'direct_message',
  'agency_invitation',
  'membership_updated',
  'membership_suspended',
  'membership_reactivated',
  'access_removed',
  'system',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type AppNotification = {
  id: string;
  agency_id: string | null;
  recipient_id: string;
  actor_id: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  route: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  expires_at: string | null;
};

export type NotificationFilters = {
  unreadOnly?: boolean;
  type?: NotificationType | 'all';
  agencyId?: string | null;
  limit?: number;
};

export type NotificationSummary = {
  unreadCount: number;
};

export function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export function formatNotificationType(type: NotificationType): string {
  switch (type) {
    case 'critical_briefing':
      return 'Critical briefing';
    case 'briefing_created':
      return 'Briefing';
    case 'briefing_updated':
      return 'Briefing update';
    case 'briefing_ack_required':
      return 'Acknowledgement';
    case 'group_post':
      return 'Group post';
    case 'group_reply':
      return 'Group reply';
    case 'group_mention':
      return 'Group mention';
    case 'direct_message':
      return 'Direct message';
    case 'agency_invitation':
      return 'Invitation';
    case 'membership_updated':
      return 'Membership update';
    case 'membership_suspended':
      return 'Suspended';
    case 'membership_reactivated':
      return 'Reactivated';
    case 'access_removed':
      return 'Access removed';
    case 'system':
      return 'System';
    default:
      return 'Notification';
  }
}
