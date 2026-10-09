import { DEFAULT_FORM_MAP } from "@thrift/shared";
import { assertClickable, ForbiddenClickError, setNativeValue } from "@/src/dom/core";
import { locateBy, locateField } from "@/src/dom/locate";
import { matchOption, pathSegments, pickByPath } from "@/src/dom/pickers";
import { hasValue, looksSet, sameKind, sizeCandidates, SIZE_TAB } from "@/src/fill/fill";
import { snapshotElements } from "@/src/dom/snapshot";
import { forbiddenWords, isForbidden, lockSubmission } from "@/src/dom/guard";
import { descriptionWithHashtags, suggestedPrice } from "@/src/fill/fill";

const forbidden = DEFAULT_FORM_MAP.forbiddenClickText;

describe("safety", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button type="submit" id="a">Hochladen</button>
      <button id="b">Entwurf speichern</button>
      <div role="button" id="c">Upload</div>
      <li id="d">Sehr gut</li>
      <button id="e"><span>Hochladen</span></button>`;
  });
  it.each(["a", "b", "c", "e"])("refuses to click #%s", (id) => {
    expect(() => assertClickable(document.getElementById(id)!, forbidden)).toThrow(ForbiddenClickError);
  });
  it("allows normal options", () => {
    expect(() => assertClickable(document.getElementById("d")!, forbidden)).not.toThrow();
  });
});

describe("only a human publishes", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="f">
        <button id="icon" aria-label="Artikel hochladen"><svg></svg></button>
        <button id="tid" data-testid="item-upload-submit-button">✓</button>
        <input id="img" type="image" alt="">
        <input id="val" type="button" value="Veröffentlichen">
        <button id="ttl" title="Als Entwurf speichern">…</button>
        <a id="away" href="/member/123">Profil</a>
        <a id="hash" href="#size">Größe</a>
        <div role="option" id="opt">Sehr gut</div>
        <div role="option" id="unter">Unterwäsche</div>
        <button type="button" id="versand">Versenden innerhalb 2 Tagen</button>
      </form>`;
  });

  it.each(["icon", "tid", "img", "val", "ttl", "away"])("treats #%s as publish-like", (id) => {
    expect(isForbidden(document.getElementById(id)!)).toBe(true);
  });

  it.each(["hash", "opt", "unter", "versand"])("allows normal control #%s (whole words only)", (id) => {
    expect(isForbidden(document.getElementById(id)!)).toBe(false);
  });

  it("a remote form map cannot remove the built-in words", () => {
    expect(forbiddenWords(["nur-das"])).toEqual(expect.arrayContaining(["hochladen", "upload", "veroffentlichen", "nur-das"]));
    expect(isForbidden(document.getElementById("icon")!, [])).toBe(true);
  });

  it("the snapshot for the AI never contains publish-like elements", () => {
    const ids = snapshotElements(document, []).map((e) => document.querySelector(`[data-thrift-id="${e.id}"]`)!.id);
    expect(ids).toEqual(expect.arrayContaining(["hash", "opt", "versand"]));
    for (const bad of ["icon", "tid", "img", "val", "ttl", "away"]) expect(ids).not.toContain(bad);
  });

  it("while filling, submits and scripted clicks on publish controls are blocked", () => {
    const form = document.getElementById("f") as HTMLFormElement;
    let submitted = 0;
    let clicked = 0;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      submitted++;
    });
    document.getElementById("icon")!.addEventListener("click", () => clicked++);
    const release = lockSubmission(document);
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    document.getElementById("icon")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(submitted).toBe(0);
    expect(clicked).toBe(0);
    release();
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(submitted).toBe(1);
  });
});

describe("inputs", () => {
  it("sets values so controlled inputs see an input event", () => {
    document.body.innerHTML = `<input id="t">`;
    const el = document.getElementById("t") as HTMLInputElement;
    let seen = "";
    el.addEventListener("input", () => (seen = el.value));
    setNativeValue(el, "COS Strickpullover");
    expect(seen).toBe("COS Strickpullover");
  });
});

describe("locate", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="field"><span>Titel</span><input id="title" placeholder="Teile Käufern mit, was du verkaufst"></div>
      <div class="field"><span>Beschreibung</span><textarea id="desc"></textarea></div>
      <div class="field"><span>Zustand</span><div role="combobox" tabindex="0" id="cond">Auswählen</div></div>
      <div class="field"><label for="p">Preis</label><input id="p"></div>
      <div data-testid="size-select-dropdown-input" id="size"></div>`;
  });
  it("finds by placeholder, label, label[for] and test-id", () => {
    expect(locateBy({ by: "placeholder", value: "Teile Käufern" })?.id).toBe("title");
    expect(locateBy({ by: "label", value: "Beschreibung" })?.id).toBe("desc");
    expect(locateBy({ by: "label", value: "zustand" })?.id).toBe("cond");
    expect(locateBy({ by: "label", value: "Preis" })?.id).toBe("p");
    expect(locateBy({ by: "testid", value: "size-select-dropdown-input" })?.id).toBe("size");
  });
  it("uses the default form map strategies in order", () => {
    expect(locateField(DEFAULT_FORM_MAP.fields.title!)?.id).toBe("title");
    expect(locateField(DEFAULT_FORM_MAP.fields.condition!)?.id).toBe("cond");
    expect(locateField(DEFAULT_FORM_MAP.fields.price!)?.id).toBe("p");
  });
});

describe("options and helpers", () => {
  const opts = ["XS", "S", "M", "L", "Neu mit Etikett", "Sehr gut", "Strickpullover"].map((label) => ({
    el: document.createElement("li"),
    label,
  }));
  it("matches exactly first, then by prefix, case/diacritics-insensitive", () => {
    expect(matchOption(opts, "m")?.label).toBe("M");
    expect(matchOption(opts, "sehr gut")?.label).toBe("Sehr gut");
    expect(matchOption(opts, "Strick")?.label).toBe("Strickpullover");
    expect(matchOption(opts, null)).toBeNull();
    expect(matchOption(opts, "38")).toBeNull();
    expect(matchOption(opts, "M / 38")?.label).toBe("M");
    expect(matchOption(opts, "Sweater")).toBeNull();
  });
  it("appends hashtags and computes a mid price", () => {
    expect(descriptionWithHashtags({ title: "t", description: "Text.", hashtags: ["cos", "strick pulli"] })).toBe(
      "Text.\n\n#cos #strickpulli",
    );
    expect(suggestedPrice({ priceMinEur: 15, priceMaxEur: 22 } as never)).toBe(19);
  });
  it("snapshot excludes forbidden buttons and our own UI", () => {
    document.body.innerHTML = `<button>Hochladen</button><div data-thrift-ui><button>Ausfüllen</button></div><div role="combobox">Rubrik</div>`;
    const els = snapshotElements(document, forbidden);
    expect(els.map((e) => e.text)).toEqual(["Rubrik"]);
  });
});

describe("category paths (vinted.de suggestions and search results)", () => {
  const el = document.createElement("div");
  const o = (label: string, detail = "") => ({ el, label, detail });
  const want = ["Herren", "Kleidung", "Pullover & Sweater", "Strickjacken"];

  it("splits shown paths", () => {
    expect(pathSegments("Herren > Kleidung > Pullover & Sweater")).toEqual(["Herren", "Kleidung", "Pullover & Sweater"]);
    expect(pathSegments("Damen › Schuhe")).toEqual(["Damen", "Schuhe"]);
  });

  it("takes the leaf whose path fits best and never the wrong department", () => {
    const opts = [o("Strickjacken", "Damen > Kleidung > Pullover & Sweater"), o("Strickjacken", "Herren > Kleidung > Pullover & Sweater"), o("Damen")];
    expect(pickByPath(opts, want).pick?.detail).toBe("Herren > Kleidung > Pullover & Sweater");
    expect(pickByPath([opts[0]!], want).pick).toBeNull();
  });

  it("reports ties for the AI to decide", () => {
    const opts = [o("Strickjacken", "Herren > Kleidung > A"), o("Strickjacken", "Herren > Kleidung > B")];
    const r = pickByPath(opts, want);
    expect(r.pick).toBeNull();
    expect(r.tied).toHaveLength(2);
  });

  it("hasValue is exact per item, so placeholders never count", () => {
    document.body.innerHTML = `<input id="s" placeholder="Wähle eine Größe"><input id="c" value="Beige, Blau"><div id="t">Strickjacken</div>`;
    expect(hasValue(document.getElementById("s"), "L")).toBe(false);
    (document.getElementById("s") as HTMLInputElement).value = "";
    expect(hasValue(document.getElementById("c"), "Blau")).toBe(true);
    expect(hasValue(document.getElementById("c"), "Bl")).toBe(false);
    expect(hasValue(document.getElementById("t"), "strickjacken")).toBe(true);
  });
});

describe("category agreement (no AI call)", () => {
  it("compares the kind of garment, ignoring generic words", () => {
    expect(sameKind("Röcke", ["Shorts", "Damen", "Kleidung", "Shorts"])).toBe(false);
    expect(sameKind("Kleider", ["Shorts", "Damen", "Kleidung"])).toBe(false);
    expect(sameKind("Shorts mit hoher Taille", ["Shorts", "Damen", "Kleidung", "Shorts"])).toBe(true);
    expect(sameKind("Strickjacken", ["Strickjacke", "Herren"])).toBe(true);
    expect(sameKind("Miniröcke", ["Minirock", "Damen", "Röcke"])).toBe(true);
  });

  it("knows when a picker field shows a chosen value", () => {
    document.body.innerHTML = `<input id="a" placeholder="Wähle eine Kategorie"><div id="b">Auswählen</div><div id="c">Röcke</div>`;
    expect(looksSet(document.getElementById("a"))).toBe(false);
    expect(looksSet(document.getElementById("b"))).toBe(false);
    expect(looksSet(document.getElementById("c"))).toBe(true);
    (document.getElementById("a") as HTMLInputElement).value = "Shorts mit hoher Taille";
    expect(looksSet(document.getElementById("a"))).toBe(true);
  });
});

describe("size labels → Vinted size tabs", () => {
  it("maps systems to tabs", () => {
    expect(sizeCandidates("ESP 42 / POR 40")).toEqual([{ tab: "FR", value: "42" }]);
    expect(sizeCandidates("EU 38")).toEqual([{ tab: "EU", value: "38" }]);
    expect(sizeCandidates("M")).toEqual([{ tab: "S/M/L", value: "M" }]);
    expect(sizeCandidates("38")).toEqual([{ tab: "EU", value: "38" }]);
    expect(sizeCandidates("M / EU 38")).toEqual([{ tab: "EU", value: "38" }, { tab: "S/M/L", value: "M" }]);
    expect(sizeCandidates("W30 L32")).toEqual([]);
  });

  it("recognises tabs, never as a size", () => {
    for (const t of ["S/M/L", "EU", "UK", "FR", "IT", "US"]) expect(SIZE_TAB.test(t)).toBe(true);
    for (const t of ["S", "M", "42", "XXL"]) expect(SIZE_TAB.test(t)).toBe(false);
  });
});
