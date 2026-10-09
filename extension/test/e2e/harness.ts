// Bundled into an IIFE by global-setup and injected into the fixture page.
import { DEFAULT_FORM_MAP } from "@thrift/shared";
import { pacer } from "../../src/dom/core";
import { collectPhotos, hasPhotos, installFileCapture } from "../../src/dom/photos";
import { fillForm, rewriteText } from "../../src/fill/fill";

(window as unknown as { Thrift: unknown }).Thrift = {
  DEFAULT_FORM_MAP,
  pacer,
  collectPhotos,
  hasPhotos,
  installFileCapture,
  fillForm,
  rewriteText,
};
