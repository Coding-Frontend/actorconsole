import View from "./view";

export { generateMetadata } from "./view";
export const dynamic = "force-dynamic";

type Props = Omit<Parameters<typeof View>[0], "initialData">;

export default function Page(props: Props) {
  return <View {...props} />;
}
