import { PublicComparisonProvider } from "@/components/comparison/public-comparison-provider";

export default function ActorComparisonLayout({ children }: { children: React.ReactNode }) {
  return <PublicComparisonProvider>{children}</PublicComparisonProvider>;
}
