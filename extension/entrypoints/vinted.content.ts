import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { DEFAULT_FORM_MAP, formatEur, formatUsd, LOW_BALANCE_USD, type Attributes, type FormMap } from "@thrift/shared";
import { aiViaBackground, bg, ClientError } from "@/src/client";
import { pacer } from "@/src/dom/core";
import { collectPhotos, hasPhotos, installFileCapture } from "@/src/dom/photos";
import { fillForm, rewriteText, type FillContext } from "@/src/fill/fill";
import { saveSettings, styleFrom, type Settings } from "@/src/settings";
import { createPanel } from "@/src/ui/panel";

function friendlyError(e: unknown, mode: Settings["mode"]): string {
  if (e instanceof ClientError) {
    if (e.kind === "no_key") return "Bitte zuerst in den Einstellungen deinen OpenRouter-Key eintragen.";
    if (e.kind === "disabled") return "Automatisches Ausfüllen ist gerade deaktiviert.";
    if (e.kind === "unauthorized")
      return mode === "server"
        ? "Server-Token ungültig – bitte in den Einstellungen prüfen."
        : "OpenRouter-Key ungültig – bitte in den Einstellungen prüfen.";
    if (e.kind === "invalid_output" || e.kind === "truncated")
      return "Konnte das Inserat nicht erstellen – bitte erneut versuchen.";
    return e.message;
  }
  return "Etwas ist schiefgelaufen – bitte erneut versuchen.";
}

export default defineContentScript({
  matches: ["https://www.vinted.de/items/new*"],
  runAt: "document_idle",
  async main() {
    installFileCapture(document);
    let settings: Settings = await bg.get("getSettings");
    const map: FormMap = await bg.get("getFormMap");
    void bg.get("heartbeat").catch(() => {});

    let language = settings.language;
    let tone = settings.tone;
    let lastAttributes: Attributes | null = null;
    let busy = false;

    let log: string[] = [];
    const ctx = (): FillContext => ({
      doc: document,
      map,
      ai: aiViaBackground,
      pace: pacer(),
      status: (m) => panel.setStatus(m),
      log: (line) => log.push(line),
    });
    const logHeader = () =>
      [
        `Thrift ${browser.runtime.getManifest().version} · Formular-Map ${map.version}${map.version === DEFAULT_FORM_MAP.version ? "" : " (Server)"}`,
        `${location.pathname} · Fenster ${innerWidth}×${innerHeight} · ${navigator.userAgent.match(/(Chrome|Safari|Firefox)\/[\d.]+/)?.[0] ?? ""}`,
        `Modelle: ${settings.model} / ${settings.navModel} · ${new Date().toISOString()}`,
      ].join("\n");

    const refreshCost = async () => {
      const u = await bg.get("getUsage").catch(() => null);
      if (u?.last) panel.setCost(`Letztes Inserat ${formatEur(u.last.costEur)} · Monat ${formatEur(u.month.costEur)}`);
      if (settings.mode === "openrouter" && settings.apiKey) {
        const b = await bg.get("getBalance").catch(() => null);
        if (b) {
          const low = b.remainingUsd < LOW_BALANCE_USD;
          panel.setBalance(`Guthaben ${formatUsd(b.remainingUsd)}${low ? " – bitte aufladen" : ""}`, low);
        }
      }
    };

    const run = async (fn: () => Promise<void>) => {
      if (busy) return;
      busy = true;
      log = [logHeader()];
      panel.setBusy(true);
      try {
        await fn();
      } catch (e) {
        log.push(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
        panel.setStatus(friendlyError(e, settings.mode), true);
      } finally {
        panel.setLog(log.join("\n"));
        busy = false;
        panel.setBusy(false);
        panel.setEnabled(hasPhotos(document, map));
        void refreshCost();
      }
    };

    const panel = createPanel(document, {
      onFill: () => {
        if (!settings.noticeAccepted) {
          panel.showNotice(true);
          return;
        }
        void run(async () => {
          panel.setStatus("Lese Fotos …");
          const photos = await collectPhotos(document, map);
          if (!photos.length) throw new ClientError("Keine Fotos gefunden – erst Fotos hinzufügen.");
          const report = await fillForm(ctx(), photos, styleFrom(settings, { language, tone }));
          lastAttributes = report.attributes;
          log.push(`Ergebnis: gefüllt ${report.filled.join(", ") || "–"}; offen ${report.unresolved.map((u) => u.key).join(", ") || "–"}`);
          panel.showResult(report.unresolved, true);
        });
      },
      onRewrite: () => {
        if (!lastAttributes) return;
        const attrs = lastAttributes;
        void run(async () => {
          panel.setStatus("Schreibe Text neu …");
          await rewriteText(ctx(), attrs, styleFrom(settings, { language, tone }));
          panel.setStatus("Text aktualisiert – bitte prüfen");
        });
      },
      onStyleChange: (l, t) => {
        const changed = l !== language || t !== tone;
        language = l;
        tone = t;
        if (changed && lastAttributes) panel.setStatus("Tippe „Neu schreiben“, um den Text anzupassen.");
      },
      onLayoutChange: (l) => {
        settings = { ...settings, panelDock: l.dock, panelCollapsed: l.collapsed };
        void saveSettings({ panelDock: l.dock, panelCollapsed: l.collapsed }).catch(() => {});
      },
      onAcceptNotice: () => {
        void saveSettings({ noticeAccepted: true }).then((s) => {
          settings = { ...settings, noticeAccepted: s.noticeAccepted };
          panel.showNotice(false);
          panel.setStatus("Bereit.");
        });
      },
    });
    panel.setStyle(language, tone);
    panel.setLayout({ dock: settings.panelDock, collapsed: settings.panelCollapsed });

    const configured = () => (settings.mode === "server" ? !!(settings.serverUrl && settings.serverToken) : !!settings.apiKey);
    let wasEnabled: boolean | null = null;
    const updateEnabled = () => {
      if (busy) return;
      const ok = hasPhotos(document, map);
      if (ok === wasEnabled) return; // only react to changes, never overwrite results or errors
      wasEnabled = ok;
      panel.setEnabled(ok, ok ? undefined : "Erst Fotos hinzufügen");
      if (ok && !lastAttributes) {
        panel.setStatus(configured() ? "Bereit." : "Bitte zuerst in den Einstellungen deinen OpenRouter-Key eintragen.");
      }
    };
    updateEnabled();
    new MutationObserver(() => updateEnabled()).observe(document.body, { childList: true, subtree: true });
    void refreshCost();
  },
});
