import { createContext, useContext } from "react";

export const PageDataPendingContext = createContext(false);

/** True while the current page keeps its previous results during a data refresh. */
export function usePageDataPending() {
  return useContext(PageDataPendingContext);
}
