# Thrift Shop Publisher

A personal Mac app (iPhone later) that turns photos of second-hand clothes into ready-to-paste **German Vinted listings**:

1. Select a batch of photos (Photos library, Finder, drag & drop).
2. The app groups the photos per garment automatically; you fix any mistakes by dragging.
3. A vision AI model (default: Claude Haiku 5.5, about 0.1 ct per item) reads size, brand, material and condition, mainly from the size/care label photo.
4. The app writes the German title, description and keywords in your chosen tone (sachlich, freundlich, locker, hochwertig).
5. Review, then copy into Vinted or export photos + text to a folder.

## Status

Planning stage, using [OpenSpec](https://github.com/Fission-AI/OpenSpec) spec-driven development.

| Artifact | Path |
|---|---|
| Proposal (why / what) | `openspec/changes/add-vinted-listing-assistant/proposal.md` |
| Specs (behaviour contract) | `openspec/changes/add-vinted-listing-assistant/specs/*/spec.md` |
| Design (platform, model, architecture decisions) | `openspec/changes/add-vinted-listing-assistant/design.md` |
| Tasks (implementation plan) | `openspec/changes/add-vinted-listing-assistant/tasks.md` |

```bash
npm i -g @fission-ai/openspec
openspec show add-vinted-listing-assistant
openspec validate add-vinted-listing-assistant --strict
```

In Claude Code, run `/opsx:apply` to start implementing the tasks.
