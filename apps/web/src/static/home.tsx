import { metadata } from "../app/page";
import { HomeContent } from "../components/marketing/home-content";
import { useSession } from "../lib/session-client";
export { metadata };
export default function Home() {
  const { data: session } = useSession();
  return <HomeContent isAuthenticated={Boolean(session?.user)} />;
}
