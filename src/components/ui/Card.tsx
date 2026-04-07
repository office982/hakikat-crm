import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function Card({ children, className, noPadding }: CardProps) {
  return (
    <div
      className={cn(
        "bg-surface rounded-xl border border-border shadow-sm",
        !noPadding && "p-6",
        className
      )}
    >
      {children}
    </div>
  );
}
