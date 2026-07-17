import type { BriefingPriority } from '@/types/briefings';

export const EXAMPLE_TEMPLATE_NAMES = [
  'End-of-Shift Report',
  'Officer Safety Alert',
  'BOLO',
  'Extra Patrol Request',
  'Case Follow-Up',
  'Equipment Issue',
  'Training Notice',
] as const;

export const EXAMPLE_TEMPLATE_PRESETS: readonly {
  name: string;
  title_template: string;
  body_template: string;
  default_priority: BriefingPriority;
  requires_acknowledgement: boolean;
  suggested_category: string;
}[] = [
  {
    name: 'End-of-Shift Report',
    title_template: 'End-of-Shift Report — ',
    body_template:
      '• Significant calls / incidents:\n• Outstanding BOLO / BOLOs:\n• Arrests / bookings:\n• Equipment / vehicle notes:\n• Follow-up for oncoming shift:\n',
    default_priority: 'medium',
    requires_acknowledgement: true,
    suggested_category: 'Patrol',
  },
  {
    name: 'Officer Safety Alert',
    title_template: 'Officer Safety — ',
    body_template:
      '• Threat / hazard:\n• Location / area:\n• Suspect / vehicle descriptors:\n• Recommended tactics / cautions:\n• Source / reliability:\n',
    default_priority: 'critical',
    requires_acknowledgement: true,
    suggested_category: 'Officer Safety',
  },
  {
    name: 'BOLO',
    title_template: 'BOLO — ',
    body_template:
      '• Subject / vehicle:\n• Last known location:\n• Direction of travel:\n• Reason for BOLO:\n• Actions if located:\n',
    default_priority: 'high',
    requires_acknowledgement: true,
    suggested_category: 'BOLO',
  },
  {
    name: 'Extra Patrol Request',
    title_template: 'Extra Patrol — ',
    body_template:
      '• Location / beat:\n• Concern / complaint:\n• Preferred times:\n• Contact / reporting party:\n• Notes for patrol:\n',
    default_priority: 'medium',
    requires_acknowledgement: false,
    suggested_category: 'Patrol',
  },
  {
    name: 'Case Follow-Up',
    title_template: 'Case Follow-Up — ',
    body_template:
      '• Case / incident number:\n• Current status:\n• Required follow-up:\n• Assigned investigator / unit:\n• Deadlines:\n',
    default_priority: 'medium',
    requires_acknowledgement: true,
    suggested_category: 'Case Update',
  },
  {
    name: 'Equipment Issue',
    title_template: 'Equipment Issue — ',
    body_template:
      '• Item / asset:\n• Issue description:\n• Location / unit:\n• Immediate impact:\n• Temporary workaround:\n',
    default_priority: 'medium',
    requires_acknowledgement: false,
    suggested_category: 'Equipment',
  },
  {
    name: 'Training Notice',
    title_template: 'Training — ',
    body_template:
      '• Course / topic:\n• Date / time:\n• Location:\n• Required attendees:\n• Equipment / prep:\n',
    default_priority: 'low',
    requires_acknowledgement: true,
    suggested_category: 'Training',
  },
] as const;

export type BriefingTemplate = {
  id: string;
  agency_id: string;
  category_id: string | null;
  name: string;
  title_template: string | null;
  body_template: string;
  default_priority: BriefingPriority;
  requires_acknowledgement: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  category_name?: string | null;
};

export type CreateBriefingTemplateInput = {
  name: string;
  body_template: string;
  title_template?: string | null;
  category_id?: string | null;
  default_priority?: BriefingPriority;
  requires_acknowledgement?: boolean;
};

export type UpdateBriefingTemplateInput = {
  name?: string;
  title_template?: string | null;
  clear_title_template?: boolean;
  body_template?: string;
  category_id?: string | null;
  clear_category?: boolean;
  default_priority?: BriefingPriority;
  requires_acknowledgement?: boolean;
};
