import { PublicComparisonProvider } from "@/components/comparison/public-comparison-provider";

export default function BuildersLayout({ children }: { children: React.ReactNode }) {
  return <PublicComparisonProvider>{children}</PublicComparisonProvider>;
}
