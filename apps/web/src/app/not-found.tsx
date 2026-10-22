import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ActorMark } from "@/components/brand/actor-mark";
import { Home, FileText, BookOpen, BarChart3, Mail } from "lucide-react";

const popularPages = [
  { href: "/pricing", label: "Pricing", icon: BarChart3 },
  { href: "/docs", label: "Documentation", icon: BookOpen },
  { href: "/blog", label: "Blog", icon: FileText },
  { href: "/status", label: "System status", icon: BarChart3 },
  { href: "/contact", label: "Contact support", icon: Mail },
];

export default function NotFound() {
  return (
    <div className="bg-mist flex min-h-screen flex-col items-center justify-center p-6">
      <div className="mx-auto max-w-md text-center">
        <div className="flex justify-center">
          <ActorMark size={64} />
        </div>
        <h1 className="text-signal-orange mt-8 text-6xl font-bold tracking-tight">404</h1>
        <h2 className="text-carbon mt-4 text-xl font-semibold">Page not found</h2>
        <p className="text-graphite mt-2 text-sm">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button variant="outline" asChild>
            <Link href="/">
              <Home className="h-4 w-4" />
              Go home
            </Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </div>

        {/* Popular pages */}
        <div className="border-chalk bg-paper mt-10 rounded-xl border p-6">
          <p className="text-slate mb-4 text-xs font-semibold uppercase tracking-[0.18em]">
            Popular pages
          </p>
          <div className="space-y-2">
            {popularPages.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="text-graphite hover:bg-fog hover:text-carbon flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
              >
                <Icon className="text-slate h-4 w-4" />
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
