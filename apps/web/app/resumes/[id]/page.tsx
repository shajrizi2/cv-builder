import { ResumeWorkspace } from '@/components/resume-workspace';

export default async function ResumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResumeWorkspace id={id} />;
}
