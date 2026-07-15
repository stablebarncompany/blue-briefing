import { EmptyState, SectionLabel } from '@/components/common';
import { PageContainer } from '@/components/layout';

export default function BriefingsScreen() {
  return (
    <PageContainer>
      <SectionLabel>Briefings</SectionLabel>
      <EmptyState title="Searchable, acknowledged pass-ons for every watch." />
    </PageContainer>
  );
}
