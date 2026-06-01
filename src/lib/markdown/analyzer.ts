import { basename } from "./path";
import type { ActionItem, HealthReport, Issue, ParsedMarkdownFile } from "./types";

const STALE_DAYS = 180;
const THIN_WORDS = 120;
const DEEP_FOLDER_LEVEL = 4;
const INDEX_NAMES = new Set(["index", "overview", "readme", "moc", "map-of-content", "map of content"]);

/**
 * 基于已解析的 Markdown 文件生成标准化健康报告。
 * 分析器只依赖 ParsedMarkdownFile，避免和浏览器文件读取逻辑耦合。
 */
export function analyzeKnowledgeBase(files: ParsedMarkdownFile[]): HealthReport {
  const total = files.length;
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  const brokenLinks: { source: string; target: string }[] = [];
  const folderSet = new Set<string>();
  const tagCounts = new Map<string, number>();

  files.forEach((file) => {
    incoming.set(file.path, 0);
    outgoing.set(file.path, 0);
    if (file.folder) {
      folderSet.add(file.folder);
    }
    file.tags.forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1));
  });

  files.forEach((file) => {
    const links = [...file.wikiLinks, ...file.markdownLinks];
    const resolvedLinks = links.filter((link) => link.resolvedPath);
    outgoing.set(file.path, resolvedLinks.length);

    resolvedLinks.forEach((link) => {
      if (link.resolvedPath) {
        incoming.set(link.resolvedPath, (incoming.get(link.resolvedPath) ?? 0) + 1);
      }
    });

    links
      .filter((link) => !link.resolvedPath)
      .forEach((link) => brokenLinks.push({ source: file.path, target: link.target }));
  });

  const orphanNotes = files.filter((file) => (incoming.get(file.path) ?? 0) === 0 && (outgoing.get(file.path) ?? 0) === 0);
  const staleNotes = files.filter((file) => isStale(file.modifiedAt));
  const thinNotes = files.filter((file) => file.wordCount < THIN_WORDS);
  const duplicateTagGroups = findDuplicateTagGroups(tagCounts);
  const missingIndexFolders = findMissingIndexFolders(files);
  const deepFolderNotes = files.filter((file) => file.depth > DEEP_FOLDER_LEVEL);
  const internalLinks = files.reduce((sum, file) => sum + file.wikiLinks.length + file.markdownLinks.length, 0);

  const issues: Issue[] = [
    buildOrphanIssue(orphanNotes, total),
    buildBrokenIssue(brokenLinks),
    buildStaleIssue(staleNotes),
    buildThinIssue(thinNotes),
    buildDuplicateTagIssue(duplicateTagGroups),
    buildMissingIndexIssue(missingIndexFolders),
    buildDeepFolderIssue(deepFolderNotes, total),
  ].filter((issue): issue is Issue => Boolean(issue));

  const metrics = {
    markdownFiles: total,
    internalLinks,
    tags: tagCounts.size,
    folders: folderSet.size,
    orphanNotes: orphanNotes.length,
    brokenLinks: brokenLinks.length,
    staleNotes: staleNotes.length,
    thinNotes: thinNotes.length,
    duplicateTagGroups: duplicateTagGroups.length,
    missingIndexTopics: missingIndexFolders.length,
    deepFolderNotes: deepFolderNotes.length,
  };

  const categories = {
    connectivity: scoreConnectivity(total, orphanNotes.length, brokenLinks.length),
    freshness: scoreByRate(total, staleNotes.length, 35),
    structure: scoreStructure(total, missingIndexFolders.length, deepFolderNotes.length),
    tags: scoreByRate(Math.max(tagCounts.size, 1), duplicateTagGroups.length, 45),
    depth: scoreByRate(total, thinNotes.length, 45),
  };

  const score = Math.round(
    categories.connectivity * 0.3 +
      categories.freshness * 0.18 +
      categories.structure * 0.2 +
      categories.tags * 0.14 +
      categories.depth * 0.18,
  );

  return {
    score,
    categories,
    metrics,
    issues: issues.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)),
    actions: buildActions({
      orphanNotes,
      brokenLinks,
      duplicateTagGroups,
      missingIndexFolders,
      staleNotes,
    }),
  };
}

function isStale(modifiedAt?: number): boolean {
  if (!modifiedAt) {
    return false;
  }

  const ageMs = Date.now() - modifiedAt;
  return ageMs > STALE_DAYS * 24 * 60 * 60 * 1000;
}

function findDuplicateTagGroups(tagCounts: Map<string, number>): string[][] {
  const buckets = new Map<string, string[]>();

  tagCounts.forEach((_count, tag) => {
    const key = canonicalTag(tag);
    buckets.set(key, [...(buckets.get(key) ?? []), tag]);
  });

  const semanticAiTags = ["ai", "llm", "artificial-intelligence"];
  const presentAiTags = semanticAiTags.filter((tag) => tagCounts.has(tag) || tagCounts.has(tag.toUpperCase()));
  if (presentAiTags.length > 1) {
    buckets.set("ai-overlap", Array.from(new Set(presentAiTags)));
  }

  return Array.from(buckets.values())
    .map((tags) => Array.from(new Set(tags)))
    .filter((tags) => tags.length > 1);
}

function canonicalTag(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/s$/, "");
}

function findMissingIndexFolders(files: ParsedMarkdownFile[]): { folder: string; files: ParsedMarkdownFile[] }[] {
  const folders = new Map<string, ParsedMarkdownFile[]>();

  files.forEach((file) => {
    folders.set(file.folder, [...(folders.get(file.folder) ?? []), file]);
  });

  return Array.from(folders.entries())
    .filter(([, folderFiles]) => folderFiles.length >= 5)
    .filter(([, folderFiles]) => !folderFiles.some((file) => INDEX_NAMES.has(basename(file.path).replace(/\.md$/i, "").toLowerCase())))
    .map(([folder, folderFiles]) => ({ folder: folder || "root", files: folderFiles }));
}

function buildOrphanIssue(files: ParsedMarkdownFile[], total: number): Issue | undefined {
  if (!files.length) {
    return undefined;
  }

  return {
    id: "orphan-notes",
    type: "orphan-notes",
    priority: files.length / Math.max(total, 1) > 0.25 ? "high" : "medium",
    title: "Orphan notes",
    evidence: `${files.length} notes have no incoming links and no outgoing links, including ${formatExamples(files.map((file) => file.path))}.`,
    impact: "These notes are hard to rediscover from the rest of the knowledge base.",
    count: files.length,
    affectedPaths: files.map((file) => file.path),
  };
}

function buildBrokenIssue(links: { source: string; target: string }[]): Issue | undefined {
  if (!links.length) {
    return undefined;
  }

  return {
    id: "broken-links",
    type: "broken-links",
    priority: "high",
    title: "Broken links",
    evidence: `${links.length} links point to missing Markdown files, including ${formatExamples(
      links.map((link) => `${link.source} -> ${link.target}`),
    )}.`,
    impact: "Broken links interrupt navigation and make older references less trustworthy.",
    count: links.length,
    affectedPaths: links.map((link) => link.source),
  };
}

function buildStaleIssue(files: ParsedMarkdownFile[]): Issue | undefined {
  if (!files.length) {
    return undefined;
  }

  return {
    id: "stale-notes",
    type: "stale-notes",
    priority: "medium",
    title: "Stale notes",
    evidence: `${files.length} notes have not been updated in more than ${STALE_DAYS} days, including ${formatExamples(
      files.map((file) => file.path),
    )}.`,
    impact: "Old notes may contain outdated assumptions or decisions.",
    count: files.length,
    affectedPaths: files.map((file) => file.path),
  };
}

function buildThinIssue(files: ParsedMarkdownFile[]): Issue | undefined {
  if (!files.length) {
    return undefined;
  }

  return {
    id: "thin-notes",
    type: "thin-notes",
    priority: "low",
    title: "Thin notes",
    evidence: `${files.length} notes contain fewer than ${THIN_WORDS} words, including ${formatExamples(files.map((file) => file.path))}.`,
    impact: "Very short notes often need context, links, or consolidation.",
    count: files.length,
    affectedPaths: files.map((file) => file.path),
  };
}

function buildDuplicateTagIssue(groups: string[][]): Issue | undefined {
  if (!groups.length) {
    return undefined;
  }

  return {
    id: "duplicate-tags",
    type: "duplicate-tags",
    priority: "medium",
    title: "Duplicate tag groups",
    evidence: `${groups.length} tag groups look duplicated or overlapping, including ${formatExamples(
      groups.map((group) => group.map((tag) => `#${tag}`).join(", ")),
    )}.`,
    impact: "Tag drift makes filtering less reliable and hides related notes.",
    count: groups.length,
    affectedPaths: groups.flat(),
  };
}

function buildMissingIndexIssue(folders: { folder: string; files: ParsedMarkdownFile[] }[]): Issue | undefined {
  if (!folders.length) {
    return undefined;
  }

  return {
    id: "missing-index",
    type: "missing-index",
    priority: "medium",
    title: "Missing index pages",
    evidence: `${folders.length} folders contain 5 or more notes but no index, overview, README, or map-of-content page, including ${formatExamples(
      folders.map((folder) => `${folder.folder} (${folder.files.length} notes)`),
    )}.`,
    impact: "Dense topic areas need entry points so future navigation does not depend on memory.",
    count: folders.length,
    affectedPaths: folders.flatMap((folder) => folder.files.map((file) => file.path)),
  };
}

function buildDeepFolderIssue(files: ParsedMarkdownFile[], total: number): Issue | undefined {
  if (!files.length) {
    return undefined;
  }

  return {
    id: "deep-folders",
    type: "deep-folders",
    priority: files.length / Math.max(total, 1) > 0.15 ? "medium" : "low",
    title: "Deep folders",
    evidence: `${Math.round((files.length / Math.max(total, 1)) * 100)}% of notes are nested deeper than ${DEEP_FOLDER_LEVEL} folder levels, including ${formatExamples(
      files.map((file) => file.path),
    )}.`,
    impact: "Deep paths increase friction when browsing, linking, or moving notes.",
    count: files.length,
    affectedPaths: files.map((file) => file.path),
  };
}

function buildActions(input: {
  orphanNotes: ParsedMarkdownFile[];
  brokenLinks: { source: string; target: string }[];
  duplicateTagGroups: string[][];
  missingIndexFolders: { folder: string; files: ParsedMarkdownFile[] }[];
  staleNotes: ParsedMarkdownFile[];
}): ActionItem[] {
  return [
    {
      id: "connect-orphans",
      title: "Connect orphan notes",
      why: "This usually improves navigation fastest because isolated notes become reachable from existing topics.",
      noteCount: input.orphanNotes.length,
      examplePaths: input.orphanNotes.slice(0, 5).map((file) => file.path),
      checklist: input.orphanNotes.slice(0, 8).map((file) => `Add one inbound or outbound link for ${file.path}`),
    },
    {
      id: "fix-broken-links",
      title: "Fix broken links",
      why: "Broken links are high-confidence maintenance work and protect trust in older notes.",
      noteCount: input.brokenLinks.length,
      examplePaths: input.brokenLinks.slice(0, 5).map((link) => `${link.source} -> ${link.target}`),
      checklist: input.brokenLinks.slice(0, 8).map((link) => `Resolve ${link.target} from ${link.source}`),
    },
    {
      id: "normalize-tags",
      title: "Normalize duplicate tags",
      why: "Merging duplicate tags makes search and filtering more predictable.",
      noteCount: input.duplicateTagGroups.length,
      examplePaths: input.duplicateTagGroups.slice(0, 5).map((group) => group.map((tag) => `#${tag}`).join(", ")),
      checklist: input.duplicateTagGroups.slice(0, 8).map((group) => `Choose one canonical tag for ${group.map((tag) => `#${tag}`).join(", ")}`),
    },
    {
      id: "create-index-pages",
      title: "Create topic index pages",
      why: "Index pages create stable entry points for folders that already contain many related notes.",
      noteCount: input.missingIndexFolders.length,
      examplePaths: input.missingIndexFolders.slice(0, 5).map((folder) => `${folder.folder}/index.md`),
      checklist: input.missingIndexFolders.slice(0, 8).map((folder) => `Create an index page for ${folder.folder}`),
    },
    {
      id: "review-stale-notes",
      title: "Review stale notes",
      why: "A small review pass helps mark old assumptions as still valid, superseded, or archived.",
      noteCount: input.staleNotes.length,
      examplePaths: input.staleNotes.slice(0, 5).map((file) => file.path),
      checklist: input.staleNotes.slice(0, 8).map((file) => `Review whether ${file.path} is still current`),
    },
  ];
}

function scoreConnectivity(total: number, orphanCount: number, brokenCount: number): number {
  if (!total) {
    return 100;
  }

  return clampScore(100 - (orphanCount / total) * 55 - (brokenCount / total) * 80);
}

function scoreStructure(total: number, missingIndexCount: number, deepCount: number): number {
  if (!total) {
    return 100;
  }

  return clampScore(100 - missingIndexCount * 8 - (deepCount / total) * 40);
}

function scoreByRate(total: number, count: number, penalty: number): number {
  if (!total) {
    return 100;
  }

  return clampScore(100 - (count / total) * penalty);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function priorityRank(priority: Issue["priority"]): number {
  return { high: 0, medium: 1, low: 2 }[priority];
}

function formatExamples(values: string[]): string {
  const examples = values.slice(0, 3).map((value) => `\`${value}\``);
  return examples.length ? examples.join(", ") : "`none`";
}
