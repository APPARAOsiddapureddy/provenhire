import { cn } from "@/lib/utils";

interface PageLoaderProps {
  className?: string;
}

export function PageLoader({ className }: PageLoaderProps) {
  return (
    <div
      className={cn(
        "min-h-[200px] flex items-center justify-center",
        className
      )}
      aria-label="Loading"
    >
      <div
        className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"
        style={{ animationDuration: "0.6s" }}
      />
    </div>
  );
}

export function PageLoaderFullScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div
        className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin"
        style={{ animationDuration: "0.6s" }}
      />
    </div>
  );
}
