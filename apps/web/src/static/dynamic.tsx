import { lazy, Suspense, type ComponentType } from "react";
export default function dynamic<P extends object>(
  load: () => Promise<{ default: ComponentType<P> } | ComponentType<P>>,
  options: { loading?: ComponentType; ssr?: boolean } = {},
) {
  const Component = lazy(async () => {
    const loaded = await load();
    return typeof loaded === "function" ? { default: loaded } : loaded;
  });
  const Loading = options.loading;
  return function Dynamic(props: P) {
    return (
      <Suspense fallback={Loading ? <Loading /> : null}>
        <Component {...props} />
      </Suspense>
    );
  };
}
