import { renderToString } from "react-dom/server.browser";
import { PublicLocation } from "./navigation";
import { MarketingHeader } from "../components/marketing/header";
import { MarketingFooter } from "../components/marketing/footer";
import { PublicComparisonProvider } from "../components/comparison/public-comparison-provider";
import BuilderPage from "../app/(marketing)/builders/[username]/view";
import ActorPage from "../app/(marketing)/builders/[username]/actors/[actorName]/view";
import BlogPage, { normalizePost } from "../app/(marketing)/blog/[slug]/view";
import ChangelogPage from "../app/(marketing)/changelog/[slug]/view";
import type { BuilderProfile, BuilderActorDetail } from "../lib/builders";
import type { ChangelogArticle } from "../services/changelog";
import type { ReactNode } from "react";
import { PublicContent } from "../components/marketing/public-content";

export function publicMarkup(url: string, content: ReactNode) {
  return renderToString(
    <PublicLocation url={url}>
      <PublicComparisonProvider>
        <div className="marketing-grid-page flex min-h-screen flex-col">
          <MarketingHeader />
          <PublicContent>{content}</PublicContent>
          <MarketingFooter homeGrid />
        </div>
      </PublicComparisonProvider>
    </PublicLocation>,
  );
}

export async function renderPublicPage(
  route: { kind: string; username?: string; actorName?: string; slug?: string },
  data: unknown,
  url: string,
) {
  const searchParams = Promise.resolve({});
  let content: ReactNode;
  switch (route.kind) {
    case "builder":
      content = await BuilderPage({
        params: Promise.resolve({ username: route.username! }),
        searchParams,
        initialData: data as BuilderProfile,
      });
      break;
    case "actor":
      content = await ActorPage({
        params: Promise.resolve({ username: route.username!, actorName: route.actorName! }),
        searchParams,
        initialData: data as BuilderActorDetail,
      });
      break;
    case "blog":
      content = await BlogPage({
        params: Promise.resolve({ slug: route.slug! }),
        initialData: normalizePost(data),
      });
      break;
    case "changelog":
      content = await ChangelogPage({
        params: Promise.resolve({ slug: route.slug! }),
        initialData: data as { entry: ChangelogArticle; related: ChangelogArticle[] },
      });
      break;
    default:
      throw new Error("Unsupported public page");
  }
  return publicMarkup(url, content);
}
