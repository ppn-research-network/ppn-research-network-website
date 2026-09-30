import { useEffect } from 'react';
import { useSession } from '../../lib/session';
import { withBase } from '../../lib/url';
import SignInCard from './SignInCard';
import MembershipForm from './MembershipForm';

// Sign in, or request membership. Already signed in? Go to My account.
export default function SignInPage() {
  const { session, ready } = useSession();
  useEffect(() => {
    if (session) window.location.replace(withBase('/account/'));
  }, [session]);

  if (!ready || session) return <p className="min-h-[90vh] text-muted" role="status">Checking your sign-in…</p>;
  return (
    <>
      <h1 className="text-4xl sm:text-5xl">Sign in</h1>
      <p className="mt-4 max-w-3xl text-lg text-[#33403a]">
        Sign in to update or withdraw your listings. Members can also see recordings, templates and protocols shared across
        the network. The data and skills directories stay open to everyone.
      </p>
      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.4fr] lg:items-start">
        <SignInCard returnTo="/account/" />
        <MembershipForm />
      </div>
    </>
  );
}
