export default function DashboardRouteLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <p
        role="status"
        className="rounded-lg border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-600 shadow-sm"
      >
        Loading secure workspace…
      </p>
    </main>
  );
}
