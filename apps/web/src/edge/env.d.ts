declare module "*.html?raw" {
  const value: string;
  export default value;
}
declare module "react-dom/server.browser" {
  export { renderToString } from "react-dom/server";
}
