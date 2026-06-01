import {
  basename,
  dirname,
  folderDepth,
  normalizePath,
  resolveRelativeMarkdownLink,
  stripMarkdownExtension,
} from "./path";
import type { KnowledgeFile, ParsedLink, ParsedMarkdownFile } from "./types";

const FRONTMATTER_PATTERN = /^---\s*\n([\s\S]*?)\n---\s*/;
const INLINE_TAG_PATTERN = /(^|[\s(])#([A-Za-z0-9][A-Za-z0-9/_-]*)/g;
const WIKI_LINK_PATTERN = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
const MARKDOWN_LINK_PATTERN = /!?\[([^\]]*)\]\(([^)]+)\)/g;
const EXTERNAL_LINK_PATTERN = /^(https?:|mailto:|tel:|#)/i;

/**
 * 将标准化文件对象解析成分析器所需的 Markdown 元数据。
 * 这里不访问浏览器 API，保证未来可以复用到 CLI、Tauri 或编辑器插件。
 */
export function parseMarkdownFiles(files: KnowledgeFile[]): ParsedMarkdownFile[] {
  const firstPass = files.map((file) => {
    const path = normalizePath(file.path);
    const frontmatter = extractFrontmatter(file.content);
    const body = file.content.replace(FRONTMATTER_PATTERN, "");
    const frontmatterTags = extractFrontmatterTags(frontmatter);
    const inlineTags = extractInlineTags(body);
    const wikiLinks = extractWikiLinks(body);
    const markdownLinks = extractMarkdownLinks(path, body);
    const tags = uniqueTags([...frontmatterTags, ...inlineTags]);

    return {
      ...file,
      path,
      title: extractTitle(body, path),
      wordCount: countWords(body),
      frontmatterTags,
      inlineTags,
      tags,
      wikiLinks,
      markdownLinks,
      folder: dirname(path),
      depth: folderDepth(path),
    };
  });

  return resolveLinks(firstPass);
}

function extractFrontmatter(content: string): string {
  return content.match(FRONTMATTER_PATTERN)?.[1] ?? "";
}

function extractFrontmatterTags(frontmatter: string): string[] {
  if (!frontmatter) {
    return [];
  }

  const tags: string[] = [];
  const lines = frontmatter.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const inlineMatch = line.match(/^tags:\s*(.+)$/i);

    if (inlineMatch?.[1]) {
      tags.push(...parseTagValue(inlineMatch[1]));
      continue;
    }

    if (/^tags:\s*$/i.test(line)) {
      for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
        const nestedLine = lines[nextIndex] ?? "";
        const nestedMatch = nestedLine.match(/^\s*-\s*(.+)$/);
        if (!nestedMatch?.[1]) {
          break;
        }
        tags.push(normalizeTag(nestedMatch[1]));
      }
    }
  }

  return uniqueTags(tags);
}

function parseTagValue(value: string): string[] {
  const trimmed = value.trim();

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map(normalizeTag)
      .filter(Boolean);
  }

  return trimmed
    .split(/[,\s]+/)
    .map(normalizeTag)
    .filter(Boolean);
}

function extractInlineTags(content: string): string[] {
  const tags: string[] = [];

  for (const match of content.matchAll(INLINE_TAG_PATTERN)) {
    if (match[2]) {
      tags.push(normalizeTag(match[2]));
    }
  }

  return uniqueTags(tags);
}

function extractWikiLinks(content: string): ParsedLink[] {
  return Array.from(content.matchAll(WIKI_LINK_PATTERN)).map((match) => ({
    raw: match[0],
    target: normalizePath((match[1] ?? "").trim()),
  }));
}

function extractMarkdownLinks(path: string, content: string): ParsedLink[] {
  return Array.from(content.matchAll(MARKDOWN_LINK_PATTERN))
    .map((match) => {
      const href = (match[2] ?? "").trim();
      return {
        raw: match[0],
        target: href,
        resolvedPath:
          href && !EXTERNAL_LINK_PATTERN.test(href) && href.split("#")[0]?.split("?")[0]?.toLowerCase().endsWith(".md")
            ? resolveRelativeMarkdownLink(path, href)
            : undefined,
      };
    })
    .filter((link) => link.resolvedPath || shouldTreatAsInternalMarkdown(link.target));
}

function shouldTreatAsInternalMarkdown(href: string): boolean {
  if (!href || EXTERNAL_LINK_PATTERN.test(href)) {
    return false;
  }

  return href.split("#")[0]?.split("?")[0]?.toLowerCase().endsWith(".md") ?? false;
}

function extractTitle(content: string, path: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || basename(path).replace(/\.md$/i, "");
}

function countWords(content: string): number {
  const text = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(WIKI_LINK_PATTERN, " ")
    .replace(MARKDOWN_LINK_PATTERN, " ")
    .replace(/[>#*_~\-[\]()]/g, " ");

  return text.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?|[\u4e00-\u9fff]/g)?.length ?? 0;
}

function resolveLinks(files: ParsedMarkdownFile[]): ParsedMarkdownFile[] {
  const exactPaths = new Set(files.map((file) => file.path.toLowerCase()));
  const noExtensionLookup = new Map<string, string>();
  const basenameLookup = new Map<string, string>();

  files.forEach((file) => {
    const noExtension = stripMarkdownExtension(file.path).toLowerCase();
    noExtensionLookup.set(noExtension, file.path);
    basenameLookup.set(stripMarkdownExtension(basename(file.path)).toLowerCase(), file.path);
  });

  return files.map((file) => ({
    ...file,
    wikiLinks: file.wikiLinks.map((link) => ({
      ...link,
      resolvedPath: resolveWikiTarget(link.target, exactPaths, noExtensionLookup, basenameLookup),
    })),
    markdownLinks: file.markdownLinks.map((link) => ({
      ...link,
      resolvedPath: link.resolvedPath && exactPaths.has(link.resolvedPath.toLowerCase()) ? link.resolvedPath : undefined,
    })),
  }));
}

function resolveWikiTarget(
  target: string,
  exactPaths: Set<string>,
  noExtensionLookup: Map<string, string>,
  basenameLookup: Map<string, string>,
): string | undefined {
  const normalizedTarget = normalizePath(target);
  const markdownTarget = normalizedTarget.toLowerCase().endsWith(".md") ? normalizedTarget : `${normalizedTarget}.md`;

  if (exactPaths.has(markdownTarget.toLowerCase())) {
    return markdownTarget;
  }

  const noExtension = stripMarkdownExtension(normalizedTarget).toLowerCase();
  return noExtensionLookup.get(noExtension) ?? basenameLookup.get(noExtension);
}

function normalizeTag(value: string): string {
  return value.trim().replace(/^#/, "").replace(/^["']|["']$/g, "");
}

function uniqueTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map(normalizeTag).filter(Boolean)));
}
