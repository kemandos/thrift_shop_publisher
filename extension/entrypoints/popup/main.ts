import { browser } from "wxt/browser";
import { formatEur, formatUsd, LOW_BALANCE_USD } from "@thrift/shared";
import { bg } from "@/src/client";

const SELL_URL = "https://www.vinted.de/items/new";
const $ = (id: string) => document.getElementById(id)!;

$("sell").addEventListener("click", async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== undefined) await browser.tabs.update(tab.id, { url: SELL_URL });
  else await browser.tabs.create({ url: SELL_URL });
  window.close();
});
$("options").addEventListener("click", () => void browser.runtime.openOptionsPage());

void (async () => {
  const [s, u] = await Promise.all([bg.get("getSettings"), bg.get("getUsage")]);
  const configured = s.mode === "server" ? !!(s.serverUrl && s.serverToken) : !!s.apiKey;
  $("setup").classList.toggle("hidden", configured);
  $("last").textContent = u.last ? formatEur(u.last.costEur) : "–";
  $("month").textContent = formatEur(u.month.costEur);
  if (s.mode === "openrouter" && s.apiKey) {
    const b = await bg.get("getBalance").catch(() => null);
    $("balanceBox").classList.remove("hidden");
    $("balance").textContent = b ? formatUsd(b.remainingUsd) + (b.remainingUsd < LOW_BALANCE_USD ? " – fast leer" : "") : "nicht abrufbar";
    $("balance").classList.toggle("text-danger", !!b && b.remainingUsd < LOW_BALANCE_USD);
  }
})();
