import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("w-6 h-6 animate-spin text-primary", className)} />;
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <Spinner className="w-8 h-8" />
    </div>
  );
}
