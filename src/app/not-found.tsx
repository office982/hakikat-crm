import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <FileQuestion className="w-12 h-12 text-muted mb-4" />
      <h2 className="text-xl font-semibold mb-2">הדף לא נמצא</h2>
      <p className="text-muted mb-6">הדף שחיפשת לא קיים או שהוסר.</p>
      <Link href="/">
        <Button>חזרה ללוח הבקרה</Button>
      </Link>
    </div>
  );
}
