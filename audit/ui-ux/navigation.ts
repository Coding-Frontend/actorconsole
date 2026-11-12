export function usePathname() { return "/docs/first-workspace"; }
export function useRouter() {
  return { push: (href: string) => { document.body.dataset.destination = href; }, refresh() {} };
}
