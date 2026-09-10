import { DraftProvider } from '@/components/cms/DraftProvider';

export default function ContentLayout({ children }: { children: React.ReactNode }) {
  return <DraftProvider>{children}</DraftProvider>;
}
