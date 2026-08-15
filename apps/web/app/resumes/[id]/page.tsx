import { ResumeWorkspace } from '@/components/resume-workspace';
import { AccountNavigation } from '@/components/account-navigation';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function ResumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/sign-in?returnTo=${encodeURIComponent(`/resumes/${id}`)}`);
  return (
    <>
      <AccountNavigation name={session.user.name} email={session.user.email} />
      <ResumeWorkspace id={id} />
    </>
  );
}
