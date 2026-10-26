import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Pending() {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (u.status === "APPROVED") redirect("/marketplace");
  return (
    <div className="mx-auto max-w-lg card p-8 text-center">
      <h1 className="text-xl font-bold">{u.status === "REJECTED" ? "Application not approved" : "Application received"}</h1>
      <p className="mt-3 text-slate-600">
        {u.status === "REJECTED"
          ? "Thank you for your interest. Your application doesn't match our current network criteria. We'll keep your profile on file."
          : "Thanks, " + u.name.split(" ")[0] + ". The DEAC team reviews every investor personally. You'll get an email once your membership is approved, and the full portfolio will unlock here."}
      </p>
      <Link href="/" className="btn-ghost mt-6">Back to home</Link>
    </div>
  );
}
