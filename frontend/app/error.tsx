// app/error.tsx - Global error boundary
"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <h1 className="text-6xl font-bold text-slate-900 mb-4">Oops!</h1>
          <h2 className="text-2xl font-semibold text-slate-700 mb-2">Something went wrong</h2>
          <p className="text-slate-600">
            We encountered an unexpected error. Our team has been notified.
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={reset}
            className="w-full bg-[#004434] text-white px-6 py-3 rounded-xl hover:bg-[#003a2f] transition-colors"
          >
            Try Again
          </button>
          
          <Link
            href="/dashboard"
            className="block w-full bg-slate-100 text-slate-700 px-6 py-3 rounded-xl hover:bg-slate-200 transition-colors"
          >
            Go to Dashboard
          </Link>

          <Link
            href="/"
            className="block text-slate-600 hover:text-slate-900 transition-colors"
          >
            Return Home
          </Link>
        </div>

        {process.env.NODE_ENV === "development" && error.digest && (
          <div className="mt-8 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm font-mono">
              Error Digest: {error.digest}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---

// app/not-found.tsx - 404 page
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <h1 className="text-6xl font-bold text-slate-900 mb-4">404</h1>
          <h2 className="text-2xl font-semibold text-slate-700 mb-2">Page Not Found</h2>
          <p className="text-slate-600">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        <div className="space-y-4">
          <Link
            href="/dashboard"
            className="block w-full bg-[#004434] text-white px-6 py-3 rounded-xl hover:bg-[#003a2f] transition-colors"
          >
            Go to Dashboard
          </Link>
          
          <Link
            href="/"
            className="block w-full bg-slate-100 text-slate-700 px-6 py-3 rounded-xl hover:bg-slate-200 transition-colors"
          >
            Return Home
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---

// app/loading.tsx - Global loading component
export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#004434] mx-auto mb-4"></div>
        <p className="text-slate-600">Loading...</p>
      </div>
    </div>
  );
}
