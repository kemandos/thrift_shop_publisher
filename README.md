# Thrift Shop Publisher

A personal helper for selling clothes on **Vinted**, on the computer (Chrome) and the iPhone (Safari):

1. Open **vinted.de → Artikel verkaufen** and add your photos as usual.
2. Tap **✨ Ausfüllen**. Claude looks at the photos, reads the size from the label, and fills in title, description, category, brand, size, condition, colour and price, in **German or English** and in your chosen tone.
3. Check it and tap **Hochladen** yourself. The extension never posts on its own.

Cost: about 0.2 ct per item with your own Anthropic API key. An optional small server on your own Oracle VM can hold the key instead.

## Status

Planning stage, using [OpenSpec](https://github.com/Fission-AI/OpenSpec) spec-driven development.

| Change | Status |
|---|---|
| `add-vinted-autofill-extension` | **Active plan**: TypeScript extension (Chrome + Safari iOS), optional server, small iPhone container app |
| `add-iphone-listing-app` | Parked: full native iPhone app with backend and subscriptions, for a possible public product later |

Design mockups: the claude.ai design canvas "Thrift Shop – iPhone Designvorschläge".
Research notes: `docs/ios27-research.md`.

```bash
npm i -g @fission-ai/openspec
openspec show add-vinted-autofill-extension
openspec validate add-vinted-autofill-extension --strict
```

In Claude Code, run `/opsx:apply add-vinted-autofill-extension` to start implementing.
