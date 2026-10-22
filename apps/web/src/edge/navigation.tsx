import { createContext, useContext, type ReactNode } from "react";

const Location = createContext(new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:8080"));
export function PublicLocation({ url, children }: { url: string; children: ReactNode }) {
  return <Location.Provider value={new URL(url)}>{children}</Location.Provider>;
}
export function usePathname() {
  return useContext(Location).pathname;
}
export function useSearchParams() {
  return useContext(Location).searchParams;
}
export function useRouter() {
  const noop = () => {};
  return { push: noop, replace: noop, refresh: noop, back: noop, forward: noop, prefetch: noop };
}
export function notFound(): never {
  throw new Error("Public page not found");
}
