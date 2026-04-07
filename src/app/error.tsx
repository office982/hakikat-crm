"use client";

import { Button } from "@/components/ui/Button";
import { AlertTriangle } from "lucide-react";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <AlertTriangle className="w-12 h-12 text-danger mb-4" />
      <h2 className="text-xl font-semibold mb-2">שגיאה בטעינת הנתונים</h2>
      <p className="text-muted mb-6">אירעה שגיאה בלתי צפויה. נסה שוב.</p>
      <Button onClick={reset}>נסה שוב</Button>
    </div>
  );
}
