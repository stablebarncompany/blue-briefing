import { EmptyState, SectionLabel } from '@/components/common';
import { PageContainer } from '@/components/layout';

export default function GroupsScreen() {
  return (
    <PageContainer>
      <SectionLabel>Groups</SectionLabel>
      <EmptyState title="Invite-only channels." />
    </PageContainer>
  );
}
