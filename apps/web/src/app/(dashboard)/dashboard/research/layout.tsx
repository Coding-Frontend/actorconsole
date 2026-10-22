import { PublicComparisonProvider } from "@/components/comparison/public-comparison-provider";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PublicComparisonProvider>{children}</PublicComparisonProvider>;
}
