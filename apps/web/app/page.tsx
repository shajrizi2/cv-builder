import { ResumeDashboard } from '@/components/resume-dashboard';
import { AccountNavigation } from '@/components/account-navigation';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/sign-in?returnTo=/');
  return (
    <>
      <AccountNavigation name={session.user.name} email={session.user.email} />
      <ResumeDashboard />
    </>
  );
}
