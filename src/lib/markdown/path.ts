/**
 * 统一浏览器 File System Access API 返回的路径格式，保证分析器只处理 POSIX 风格路径。
 */
export function normalizePath(path: string): string {
  const parts: string[] = [];

  path
    .replace(/\\/g, "/")
    .split("/")
    .forEach((part) => {
      if (!part || part === ".") {
        return;
      }
      if (part === "..") {
        parts.pop();
        return;
      }
      parts.push(part);
    });

  return parts.join("/");
}

export function dirname(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}

export function basename(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index === -1 ? normalized : normalized.slice(index + 1);
}

export function stripMarkdownExtension(path: string): string {
  return normalizePath(path).replace(/\.md$/i, "");
}

export function folderDepth(path: string): number {
  const dir = dirname(path);
  return dir ? dir.split("/").length : 0;
}

export function resolveRelativeMarkdownLink(fromPath: string, href: string): string {
  const cleanHref = href.split("#")[0]?.split("?")[0] ?? href;
  const decodedHref = safeDecodeURIComponent(cleanHref);
  return normalizePath(`${dirname(fromPath)}/${decodedHref}`);
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
