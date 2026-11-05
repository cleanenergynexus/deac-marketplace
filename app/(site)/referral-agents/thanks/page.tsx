import Link from "next/link";
export default function Thanks() {
  return (
    <div className="mx-auto max-w-lg card p-8 text-center">
      <h1 className="text-xl font-bold">Application Received</h1>
      <p className="mt-3 text-slate-600">Thank you for applying to be a DEAC referral agent. Our team reviews every application personally and will email you once your agent login is ready. You&apos;ll sign in with the email and password you just chose.</p>
      <Link href="/" className="btn-ghost mt-6">Back to home</Link>
    </div>
  );
}
