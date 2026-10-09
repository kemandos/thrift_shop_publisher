# Thrift Shop Publisher

An iPhone app that turns photos of second-hand clothes into ready-to-use **Vinted listings**:

1. Pick photos from the library. The app groups them per garment on the device.
2. AI reads the **size from the label** and identifies type, brand, material and condition. It says "unknown" instead of guessing.
3. Title, description and hashtags are written in **German or English**, in the tone you choose, and you can edit them.
4. **Veröffentlichen**: the photos go into a "Vinted" album and the Vinted app opens. Our keyboard fills in the text with one tap per field, and you tap "Hochladen".
5. First run is guided step by step, and help/FAQ is built in.

Pricing: 10 free listings once, then Basic €4.99/month or Pro €9.99/month, or a credit pack.

## Status

Planning stage, using [OpenSpec](https://github.com/Fission-AI/OpenSpec) spec-driven development.

| Artifact | Path |
|---|---|
| Proposal (why / what) | `openspec/changes/add-iphone-listing-app/proposal.md` |
| Specs (behaviour contract, 9 capabilities) | `openspec/changes/add-iphone-listing-app/specs/*/spec.md` |
| Design (Swift, hybrid AI, backend, pricing, handoff) | `openspec/changes/add-iphone-listing-app/design.md` |
| Tasks (implementation plan) | `openspec/changes/add-iphone-listing-app/tasks.md` |

```bash
npm i -g @fission-ai/openspec
openspec show add-iphone-listing-app
openspec validate add-iphone-listing-app --strict
```

In Claude Code, run `/opsx:apply` to start implementing.
