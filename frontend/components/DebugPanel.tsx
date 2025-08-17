// components/DebugPanel.tsx - Add this temporarily to debug issues
"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";

export default function DebugPanel() {
  const { isLoaded: authLoaded, isSignedIn, userId } = useAuth();
  const { isLoaded: userLoaded, user } = useUser();
  const [apiStatus, setApiStatus] = useState<string>("pending");
  const [dbStatus, setDbStatus] = useState<string>("pending");

  useEffect(() => {
    // Test API connectivity
    fetch("/api/health")
      .then(r => r.ok ? setApiStatus("✓ OK") : setApiStatus("✗ Failed"))
      .catch(() => setApiStatus("✗ Error"));

    // Test database
    fetch("/api/listings?pageSize=1")
      .then(r => r.ok ? setDbStatus("✓ OK") : setDbStatus("✗ Failed"))
      .catch(() => setDbStatus("✗ Error"));
  }, []);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-4 right-4 bg-black text-white p-4 rounded-lg text-xs max-w-sm z-50">
      <div className="font-bold mb-2">Debug Panel</div>
      <div className="space-y-1">
        <div>Auth Loaded: {authLoaded ? "✓" : "✗"}</div>
        <div>User Loaded: {userLoaded ? "✓" : "✗"}</div>
        <div>Signed In: {isSignedIn ? "✓" : "✗"}</div>
        <div>User ID: {userId?.slice(0, 8) || "none"}</div>
        <div>Onboarded: {user?.publicMetadata?.onboarded ? "✓" : "✗"}</div>
        <div>API Status: {apiStatus}</div>
        <div>DB Status: {dbStatus}</div>
        <div>URL: {typeof window !== "undefined" ? window.location.pathname : "SSR"}</div>
      </div>
    </div>
  );
}

// Add this to your layout.tsx:
// import DebugPanel from "@/components/DebugPanel";
// 
// export default function RootLayout({ children }) {
//   return (
//     <html>
//       <body>
//         {children}
//         <DebugPanel />
//       </body>
//     </html>
//   );
// }
