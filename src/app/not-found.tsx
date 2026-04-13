import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <h2 className="text-xl font-semibold mb-2">הדף לא נמצא</h2>
      <p className="text-gray-500 mb-6">הדף שחיפשת לא קיים או שהוסר.</p>
      <Link href="/" className="text-blue-600 underline">חזרה ללוח הבקרה</Link>
    </div>
  );
}
