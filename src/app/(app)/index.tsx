import { EmptyState, SectionLabel } from '@/components/common';
import { PageContainer } from '@/components/layout';

export default function HomeScreen() {
  return (
    <PageContainer>
      <SectionLabel>Home</SectionLabel>
      <EmptyState title="Good watch. Stay informed." />
    </PageContainer>
  );
}
