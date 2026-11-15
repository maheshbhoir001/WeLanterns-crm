import { signOutAction } from "@/app/actions/auth";

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="max-w-md rounded-xl border border-slate-200 bg-white p-7 text-center shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Access unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your account does not have a CRM role that can open this page. Contact a group administrator if you think this is a mistake.
        </p>
        <form action={signOutAction} className="mt-5">
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
