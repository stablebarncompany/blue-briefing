import { EmptyState, SectionLabel } from '@/components/common';
import { PageContainer } from '@/components/layout';

export default function MessagesScreen() {
  return (
    <PageContainer>
      <SectionLabel>Messages</SectionLabel>
      <EmptyState title="Member-restricted one-to-one." />
    </PageContainer>
  );
}
