"use client";

import { useEffect } from "react";
import { PageSpinner } from "@/components/ui/Spinner";

export default function AuthRedirectPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");

    if (code && window.opener) {
      window.opener.postMessage({ type: "oauth_code", code, state }, window.location.origin);
      window.close();
    }
  }, []);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <PageSpinner />
        <p className="mt-4 text-muted">מתחבר ל-OneDrive...</p>
      </div>
    </div>
  );
}
