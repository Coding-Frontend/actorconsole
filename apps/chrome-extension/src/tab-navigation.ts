export async function navigateActiveTab(url: string): Promise<boolean> {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const activeTab = tabs.find((tab) => typeof tab.id === "number");
  if (typeof activeTab?.id !== "number") return false;
  await chrome.tabs.update(activeTab.id, { url });
  return true;
}
