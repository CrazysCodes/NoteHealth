import type { KnowledgeFile } from "./types";

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

export const sampleVault: KnowledgeFile[] = [
  {
    path: "research/retrieval-notes.md",
    modifiedAt: now - 24 * day,
    content: `---
tags: [AI, retrieval]
---
# Retrieval Notes

Retrieval quality depends on chunking, embedding quality, and evaluation loops.

Links: [[llm-evaluation]] and [broken reference](missing-eval.md).

#ai #llm
`,
  },
  {
    path: "research/llm-evaluation.md",
    modifiedAt: now - 220 * day,
    content: `# LLM Evaluation

Evaluation notes for answer faithfulness, citation quality, and retrieval coverage.

Related: [[retrieval-notes]]

#artificial-intelligence
`,
  },
  {
    path: "research/prompting.md",
    modifiedAt: now - 14 * day,
    content: `# Prompting

Small note.

#AI
`,
  },
  {
    path: "projects/product/notes/2024/archive/deep-note.md",
    modifiedAt: now - 260 * day,
    content: `# Deep Note

This note sits too deep in the folder tree and has no links.
`,
  },
  {
    path: "projects/product/roadmap.md",
    modifiedAt: now - 12 * day,
    content: `# Roadmap

This file mentions retrieval, onboarding, cleanup, local-first storage, and Markdown export.
`,
  },
  {
    path: "projects/product/risks.md",
    modifiedAt: now - 12 * day,
    content: `# Risks

Local browser support and file permission clarity are the main risks.
`,
  },
  {
    path: "projects/product/decisions.md",
    modifiedAt: now - 12 * day,
    content: `# Decisions

Keep the MVP small. Do not add accounts, cloud sync, or AI dependencies.
`,
  },
  {
    path: "projects/product/research.md",
    modifiedAt: now - 12 * day,
    content: `# Research

Users want a trustworthy report before any automated cleanup.
`,
  },
  {
    path: "projects/product/notes.md",
    modifiedAt: now - 12 * day,
    content: `# Notes

Loose product notes without a folder index.
`,
  },
];
