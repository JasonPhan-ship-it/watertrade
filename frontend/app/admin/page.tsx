// app/admin/page.tsx
export const runtime = "nodejs";

export default async function AdminHome() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold">Admin Overview</h1>
      <p className="mt-2 text-sm text-slate-600">
        Welcome to your admin panel.
      </p>
    </div>
  );
}
