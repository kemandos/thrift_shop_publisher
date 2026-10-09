import { DEFAULT_FORM_MAP } from "@thrift/shared";
import { assertClickable, ForbiddenClickError, setNativeValue } from "@/src/dom/core";
import { locateBy, locateField } from "@/src/dom/locate";
import { matchOption } from "@/src/dom/pickers";
import { snapshotElements } from "@/src/dom/snapshot";
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
