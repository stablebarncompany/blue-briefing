import { EmptyState, SectionLabel } from '@/components/common';
import { PageContainer } from '@/components/layout';

export default function MoreScreen() {
  return (
    <PageContainer>
      <SectionLabel>More</SectionLabel>
      <EmptyState title="Account & resources." />
    </PageContainer>
  );
}
