export type KnowledgeFile = {
  path: string;
  content: string;
  modifiedAt?: number;
};

export type ParsedLink = {
  raw: string;
  target: string;
  resolvedPath?: string;
};

export type ParsedMarkdownFile = KnowledgeFile & {
  title: string;
  wordCount: number;
  frontmatterTags: string[];
  inlineTags: string[];
  tags: string[];
  wikiLinks: ParsedLink[];
  markdownLinks: ParsedLink[];
  folder: string;
  depth: number;
};

export type IssuePriority = "high" | "medium" | "low";

export type Issue = {
  id: string;
  type:
    | "orphan-notes"
    | "broken-links"
    | "stale-notes"
    | "thin-notes"
    | "duplicate-tags"
    | "missing-index"
    | "deep-folders";
  priority: IssuePriority;
  title: string;
  evidence: string;
  impact: string;
  count: number;
  affectedPaths: string[];
};

export type ActionItem = {
  id: string;
  title: string;
  why: string;
  noteCount: number;
  examplePaths: string[];
  checklist: string[];
};

export type HealthReport = {
  score: number;
  categories: {
    connectivity: number;
    freshness: number;
    structure: number;
    tags: number;
    depth: number;
  };
  metrics: Record<string, number>;
  issues: Issue[];
  actions: ActionItem[];
};

export type FolderReadProgress = {
  phase: "reading" | "complete";
  markdownFiles: number;
  currentPath?: string;
};

export type FolderReadResult = {
  files: KnowledgeFile[];
  warnings: string[];
};
