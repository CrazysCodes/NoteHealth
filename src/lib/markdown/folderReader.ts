import { normalizePath } from "./path";
import type { FolderReadProgress, FolderReadResult, KnowledgeFile } from "./types";

type FileSystemFileHandleLike = {
  kind: "file";
  name: string;
  getFile: () => Promise<File>;
};

type FileSystemDirectoryHandleLike = {
  kind: "directory";
  name: string;
  entries: () => AsyncIterableIterator<[string, FileSystemHandleLike]>;
};

type FileSystemHandleLike = FileSystemFileHandleLike | FileSystemDirectoryHandleLike;

const IGNORED_DIRECTORIES = new Set([".git", "node_modules", ".next", "dist", "build", "out", "coverage", ".turbo", ".obsidian"]);
const MAX_MARKDOWN_FILES = 2000;

export class MarkdownFolderError extends Error {
  constructor(
    public readonly code: "unsupported" | "cancelled" | "empty" | "too-many-files" | "read-failed",
    message: string,
  ) {
    super(message);
    this.name = "MarkdownFolderError";
  }
}

/**
 * 通过浏览器 File System Access API 读取 Markdown 文件夹。
 * 该函数只负责本地文件读取，不做任何内容分析，避免隐私边界变模糊。
 */
export async function readMarkdownFolder(onProgress?: (progress: FolderReadProgress) => void): Promise<FolderReadResult> {
  const picker = (window as Window & {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandleLike>;
  }).showDirectoryPicker;

  if (!picker) {
    throw new MarkdownFolderError(
      "unsupported",
      "This browser does not support folder selection. Try Chrome, Edge, or another browser with the File System Access API.",
    );
  }

  try {
    const directory = await picker();
    const warnings: string[] = [];
    const files: KnowledgeFile[] = [];

    await readDirectory(directory, "", files, warnings, onProgress);

    if (!files.length) {
      throw new MarkdownFolderError("empty", "No Markdown files were found in the selected folder.");
    }

    onProgress?.({ phase: "complete", markdownFiles: files.length });
    return { files, warnings };
  } catch (error) {
    if (error instanceof MarkdownFolderError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new MarkdownFolderError("cancelled", "Folder selection was cancelled.");
    }

    throw new MarkdownFolderError("read-failed", "NoteHealth could not read this folder. Please try another Markdown folder.");
  }
}

async function readDirectory(
  directory: FileSystemDirectoryHandleLike,
  parentPath: string,
  files: KnowledgeFile[],
  warnings: string[],
  onProgress?: (progress: FolderReadProgress) => void,
): Promise<void> {
  for await (const [name, handle] of directory.entries()) {
    const currentPath = normalizePath(`${parentPath}/${name}`);

    if (handle.kind === "directory") {
      if (!IGNORED_DIRECTORIES.has(name)) {
        await readDirectory(handle, currentPath, files, warnings, onProgress);
      }
      continue;
    }

    if (!name.toLowerCase().endsWith(".md")) {
      continue;
    }

    if (files.length >= MAX_MARKDOWN_FILES) {
      throw new MarkdownFolderError(
        "too-many-files",
        `This vault has more than ${MAX_MARKDOWN_FILES} Markdown files. Choose a smaller folder for the MVP scan.`,
      );
    }

    try {
      const file = await handle.getFile();
      files.push({
        path: currentPath,
        content: await file.text(),
        modifiedAt: file.lastModified,
      });
      onProgress?.({ phase: "reading", markdownFiles: files.length, currentPath });
    } catch {
      // 单文件失败不应终止整次扫描，用户仍可得到可用报告和明确 warning。
      warnings.push(`Could not read ${currentPath}`);
    }
  }
}
