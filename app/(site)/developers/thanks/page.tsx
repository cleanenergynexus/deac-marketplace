import Link from "next/link";
export default function Thanks() {
  return (
    <div className="mx-auto max-w-lg card p-8 text-center">
      <h1 className="text-xl font-bold">Project received</h1>
      <p className="mt-3 text-slate-600">Thank you. A member of the DEAC team will review your submission and reach out to discuss next steps.</p>
      <Link href="/" className="btn-ghost mt-6">Back to home</Link>
    </div>
  );
}
