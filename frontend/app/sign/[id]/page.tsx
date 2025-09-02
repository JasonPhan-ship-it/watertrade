// app/sign/[id]/page.tsx
"use client";

import { useSearchParams, useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function SignPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSignUrl() {
      // Call your API to generate or validate the embedded signing URL
      const res = await fetch(`/api/sign-url?id=${params.id}&role=${searchParams.get("role")}&token=${searchParams.get("token")}`);
      const data = await res.json();
      setUrl(data.url);
    }
    fetchSignUrl();
  }, [params.id, searchParams]);

  if (!url) return <p>Loading signing session…</p>;

  return (
    <div className="flex justify-center items-center h-screen">
      <iframe
        src={url}
        className="w-full h-full border-0"
        allow="camera; microphone; autoplay; clipboard-read; clipboard-write"
      />
    </div>
  );
}
