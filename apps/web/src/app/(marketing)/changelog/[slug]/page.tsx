import View from "./view";

export { generateMetadata } from "./view";
export const revalidate = 60;

type Props = Omit<Parameters<typeof View>[0], "initialData">;

export default function Page(props: Props) {
  return <View {...props} />;
}
