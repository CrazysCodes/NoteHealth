"use client";

import { useMemo, useState } from "react";
import { analyzeKnowledgeBase } from "@/lib/markdown/analyzer";
import { MarkdownFolderError, readMarkdownFolder } from "@/lib/markdown/folderReader";
import { parseMarkdownFiles } from "@/lib/markdown/parser";
import { generateHealthReportMarkdown } from "@/lib/markdown/reportMarkdown";
import { sampleVault } from "@/lib/markdown/sampleVault";
import type { HealthReport, KnowledgeFile } from "@/lib/markdown/types";

type AppView = "intake" | "scanning" | "report" | "plan";

type ScanState = {
  progress: number;
  files: number;
  links: number;
  tags: number;
  folders: number;
  logs: string[];
  currentStep: number;
};

const scanSteps = [
  "Reading Markdown files",
  "Parsing headings and tags",
  "Resolving wiki links and Markdown links",
  "Detecting orphan notes",
  "Calculating health score",
];

const initialScanState: ScanState = {
  progress: 0,
  files: 0,
  links: 0,
  tags: 0,
  folders: 0,
  logs: [],
  currentStep: 0,
};

export default function Home() {
  const [view, setView] = useState<AppView>("intake");
  const [scanState, setScanState] = useState<ScanState>(initialScanState);
  const [report, setReport] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const markdownReport = useMemo(() => (report ? generateHealthReportMarkdown(report) : ""), [report]);

  async function startFolderScan() {
    setError(null);
    setWarnings([]);
    setCopied(false);
    setView("scanning");
    setScanState({ ...initialScanState, logs: ["Waiting for folder permission..."] });

    try {
      const result = await readMarkdownFolder((progress) => {
        setScanState((current) => ({
          ...current,
          progress: Math.min(36, Math.max(current.progress, progress.markdownFiles > 0 ? 18 : 8)),
          files: progress.markdownFiles,
          logs: progress.currentPath ? appendLog(current.logs, `Read ${progress.currentPath}`) : current.logs,
        }));
      });

      setWarnings(result.warnings);
      await analyzeFiles(result.files, result.warnings.length ? [`${result.warnings.length} files could not be read.`] : []);
    } catch (scanError) {
      setReport(null);
      setView("intake");

      if (scanError instanceof MarkdownFolderError && scanError.code === "cancelled") {
        setError(null);
        return;
      }

      setError(scanError instanceof Error ? scanError.message : "NoteHealth could not scan this folder.");
    }
  }

  async function startSampleScan() {
    setError(null);
    setWarnings([]);
    setCopied(false);
    setView("scanning");
    setScanState({
      ...initialScanState,
      progress: 12,
      files: sampleVault.length,
      logs: ["Loaded the sample vault in browser memory."],
    });
    await analyzeFiles(sampleVault, ["Sample vault data is bundled with the app for previewing the workflow."]);
  }

  async function analyzeFiles(files: KnowledgeFile[], extraLogs: string[] = []) {
    await advanceScan(1, 44, "Parsing headings and tags...");
    const parsed = parseMarkdownFiles(files);
    const linkCount = parsed.reduce((sum, file) => sum + file.wikiLinks.length + file.markdownLinks.length, 0);
    const tags = new Set(parsed.flatMap((file) => file.tags));
    const folders = new Set(parsed.map((file) => file.folder).filter(Boolean));

    setScanState((current) => ({
      ...current,
      files: parsed.length,
      links: linkCount,
      tags: tags.size,
      folders: folders.size,
      logs: appendMany(current.logs, [...extraLogs, `Parsed ${parsed.length} Markdown files.`]),
    }));

    await advanceScan(2, 62, "Resolved internal note references.");
    await advanceScan(3, 78, "Detected orphan notes, broken links, and stale notes.");
    const nextReport = analyzeKnowledgeBase(parsed);

    setScanState((current) => ({
      ...current,
      progress: 100,
      currentStep: 4,
      logs: appendLog(current.logs, `Calculated Knowledge Health Score: ${nextReport.score}/100.`),
    }));

    await wait(300);
    setReport(nextReport);
    setView("report");
  }

  function advanceScan(step: number, progress: number, log: string) {
    setScanState((current) => ({
      ...current,
      progress,
      currentStep: step,
      logs: appendLog(current.logs, log),
    }));

    return wait(240);
  }

  async function copyChecklist() {
    if (!report) {
      return;
    }

    const checklist = report.actions
      .flatMap((action) => (action.checklist.length ? action.checklist : [`Review ${action.title.toLowerCase()}`]))
      .map((item) => `- [ ] ${item}`)
      .join("\n");

    await navigator.clipboard.writeText(checklist);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function exportReport() {
    if (!markdownReport) {
      return;
    }

    const blob = new Blob([markdownReport], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "notehealth-report.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-6 md:px-6">
        <Header view={view} onReset={() => setView("intake")} />

        {view === "intake" && (
          <FolderIntake error={error} onSelectFolder={startFolderScan} onTrySample={startSampleScan} />
        )}

        {view === "scanning" && <ScanningView state={scanState} />}

        {view === "report" && report && (
          <HealthReportView
            report={report}
            warnings={warnings}
            onViewPlan={() => setView("plan")}
            onExport={exportReport}
          />
        )}

        {view === "plan" && report && (
          <ActionPlanView
            report={report}
            markdownReport={markdownReport}
            copied={copied}
            onBack={() => setView("report")}
            onCopy={copyChecklist}
            onExport={exportReport}
          />
        )}
      </div>
    </main>
  );
}

function Header({ view, onReset }: { view: AppView; onReset: () => void }) {
  return (
    <header className="flex items-center justify-between border-b border-[var(--border)] pb-4">
      <div>
        <p className="mono text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--muted)]">Local-first Markdown audit</p>
        <h1 className="mt-1 text-2xl font-semibold leading-8 text-[var(--foreground)] md:text-[32px] md:leading-10">
          NoteHealth
        </h1>
      </div>
      {view !== "intake" && (
        <button
          className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-muted)]"
          onClick={onReset}
          type="button"
        >
          New scan
        </button>
      )}
    </header>
  );
}

function FolderIntake({
  error,
  onSelectFolder,
  onTrySample,
}: {
  error: string | null;
  onSelectFolder: () => void;
  onTrySample: () => void;
}) {
  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8">
        <div className="max-w-3xl">
          <p className="mono text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--healthy)]">
            Browser-only analysis
          </p>
          <h2 className="mt-3 text-[32px] font-semibold leading-10 text-[var(--foreground)]">
            Check the health of your Markdown knowledge base.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-6 text-[var(--muted)]">
            Select a local folder of Markdown notes. NoteHealth scans links, tags, freshness, and structure directly in your
            browser.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              className="rounded-lg bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white hover:bg-black"
              onClick={onSelectFolder}
              type="button"
            >
              Select Markdown folder
            </button>
            <button
              className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-muted)]"
              onClick={onTrySample}
              type="button"
            >
              Try sample vault
            </button>
          </div>
          {error && (
            <div className="mt-5 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}
        </div>
      </div>

      <aside className="grid gap-4">
        <InfoPanel
          title="Privacy"
          items={["Runs locally in your browser", "Notes are never uploaded", "No account required"]}
          tone="healthy"
        />
        <InfoPanel
          title="Works with"
          items={["Plain Markdown", "Typora folders", "Obsidian vaults", "Git-backed docs"]}
          tone="neutral"
        />
      </aside>
    </section>
  );
}

function InfoPanel({ title, items, tone }: { title: string; items: string[]; tone: "healthy" | "neutral" }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="text-sm font-semibold text-[var(--foreground)]">{title}</h3>
      <ul className="mt-4 grid gap-3">
        {items.map((item) => (
          <li className="flex items-center gap-3 text-sm text-[var(--muted)]" key={item}>
            <span
              className={`h-2 w-2 rounded-full ${tone === "healthy" ? "bg-[var(--healthy)]" : "bg-[var(--border-strong)]"}`}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScanningView({ state }: { state: ScanState }) {
  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <p className="mono text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--healthy)]">
          Analysis stays in this browser session.
        </p>
        <h2 className="mt-3 text-2xl font-semibold leading-8">Reading your notes locally.</h2>
        <div className="mt-6 h-3 overflow-hidden rounded-full bg-[var(--surface-strong)]">
          <div className="h-full bg-[var(--healthy)] transition-all" style={{ width: `${state.progress}%` }} />
        </div>
        <div className="mt-3 flex justify-between text-sm text-[var(--muted)]">
          <span>{scanSteps[state.currentStep]}</span>
          <span className="mono">{state.progress}%</span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <MetricTile label="Markdown files" value={state.files} />
          <MetricTile label="Internal links" value={state.links} />
          <MetricTile label="Tags" value={state.tags} />
          <MetricTile label="Folders" value={state.folders} />
        </div>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <h3 className="text-sm font-semibold">Scan steps</h3>
        <ol className="mt-4 grid gap-3">
          {scanSteps.map((step, index) => (
            <li className="flex items-center gap-3 text-sm" key={step}>
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  index <= state.currentStep ? "bg-[var(--healthy)]" : "bg-[var(--border-strong)]"
                }`}
              />
              <span className={index <= state.currentStep ? "text-[var(--foreground)]" : "text-[var(--muted)]"}>{step}</span>
            </li>
          ))}
        </ol>

        <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4">
          <h3 className="text-sm font-semibold">Scan log</h3>
          <div className="mono mt-3 max-h-[280px] overflow-auto text-xs leading-5 text-[var(--muted)]">
            {state.logs.map((log, index) => (
              <p className="border-b border-[var(--border)] py-1 last:border-b-0" key={`${log}-${index}`}>
                {log}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function HealthReportView({
  report,
  warnings,
  onViewPlan,
  onExport,
}: {
  report: HealthReport;
  warnings: string[];
  onViewPlan: () => void;
  onExport: () => void;
}) {
  return (
    <section className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
          <p className="mono text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--muted)]">Knowledge Health Score</p>
          <div className="mt-4 flex items-end gap-2">
            <span className={`text-6xl font-semibold leading-none ${scoreTextColor(report.score)}`}>{report.score}</span>
            <span className="pb-2 text-lg text-[var(--muted)]">/ 100</span>
          </div>
          <p className="mt-4 text-sm leading-5 text-[var(--muted)]">{summaryForScore(report.score)}</p>
          <div className="mt-6 flex gap-3">
            <button
              className="rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-black"
              onClick={onViewPlan}
              type="button"
            >
              View cleanup plan
            </button>
            <button
              className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--surface-muted)]"
              onClick={onExport}
              type="button"
            >
              Export report
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="text-lg font-semibold">Category scores</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-5">
            {Object.entries(report.categories).map(([name, score]) => (
              <ScoreBar key={name} label={formatName(name)} score={score} />
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
        <MetricTile label="Orphan notes" value={report.metrics.orphanNotes ?? 0} tone="warning" />
        <MetricTile label="Broken links" value={report.metrics.brokenLinks ?? 0} tone="danger" />
        <MetricTile label="Stale notes" value={report.metrics.staleNotes ?? 0} tone="warning" />
        <MetricTile label="Thin notes" value={report.metrics.thinNotes ?? 0} tone="neutral" />
        <MetricTile label="Duplicate tag groups" value={report.metrics.duplicateTagGroups ?? 0} tone="warning" />
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-4 text-sm text-[var(--warning)]">
          {warnings.length} warning{warnings.length === 1 ? "" : "s"} during scan. The report excludes unreadable files.
        </div>
      )}

      <div className="grid gap-4">
        <h2 className="text-lg font-semibold">Issues</h2>
        {report.issues.length ? (
          report.issues.map((issue) => <IssueCard issue={issue} key={issue.id} />)
        ) : (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 text-sm text-[var(--muted)]">
            No issues detected by the MVP rules.
          </div>
        )}
      </div>
    </section>
  );
}

function ActionPlanView({
  report,
  markdownReport,
  copied,
  onBack,
  onCopy,
  onExport,
}: {
  report: HealthReport;
  markdownReport: string;
  copied: boolean;
  onBack: () => void;
  onCopy: () => void;
  onExport: () => void;
}) {
  return (
    <section className="grid gap-6">
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 md:flex-row md:items-center">
        <div>
          <p className="mono text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--healthy)]">Action Plan</p>
          <h2 className="mt-2 text-2xl font-semibold leading-8">Start with the changes that improve navigation fastest.</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--surface-muted)]"
            onClick={onBack}
            type="button"
          >
            Back to report
          </button>
          <button
            className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--surface-muted)]"
            onClick={onCopy}
            type="button"
          >
            {copied ? "Checklist copied" : "Copy cleanup checklist"}
          </button>
          <button
            className="rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-black"
            onClick={onExport}
            type="button"
          >
            Export health report
          </button>
        </div>
      </div>

      <div className="grid gap-4">
        {report.actions.map((action, index) => (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5" key={action.id}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="mono text-xs text-[var(--muted)]">Priority {index + 1}</p>
                <h3 className="mt-1 text-lg font-semibold">{action.title}</h3>
                <p className="mt-2 max-w-3xl text-sm leading-5 text-[var(--muted)]">{action.why}</p>
              </div>
              <span className="w-fit rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-sm font-medium">
                {action.noteCount} items
              </span>
            </div>
            <div className="mono mt-4 grid gap-2 text-xs text-[var(--muted)]">
              {action.examplePaths.length ? (
                action.examplePaths.map((path) => (
                  <div className="rounded border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2" key={path}>
                    {path}
                  </div>
                ))
              ) : (
                <div className="rounded border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
                  No matching files in this scan.
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="text-lg font-semibold">Markdown report preview</h3>
        <textarea
          className="mono mt-4 h-[360px] w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-xs leading-5 text-[var(--foreground)]"
          readOnly
          value={markdownReport}
        />
      </div>
    </section>
  );
}

function MetricTile({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "warning" | "danger" }) {
  const toneClass =
    tone === "danger" ? "text-[var(--danger)]" : tone === "warning" ? "text-[var(--warning)]" : "text-[var(--foreground)]";

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className={`mono mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="mono text-sm text-[var(--muted)]">{score}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-strong)]">
        <div className={`h-full ${scoreFill(score)}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function IssueCard({ issue }: { issue: HealthReport["issues"][number] }) {
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <span className={`mono rounded-full px-2.5 py-1 text-xs font-bold uppercase ${priorityClass(issue.priority)}`}>
            {issue.priority}
          </span>
          <h3 className="mt-3 text-lg font-semibold">{issue.title}</h3>
        </div>
        <span className="mono text-sm text-[var(--muted)]">{issue.count} found</span>
      </div>
      <p className="mono mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-xs leading-5 text-[var(--foreground)]">
        {issue.evidence}
      </p>
      <p className="mt-3 text-sm leading-5 text-[var(--muted)]">{issue.impact}</p>
    </article>
  );
}

function appendLog(logs: string[], next: string): string[] {
  return [...logs, next].slice(-80);
}

function appendMany(logs: string[], next: string[]): string[] {
  return [...logs, ...next].slice(-80);
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function summaryForScore(score: number): string {
  if (score >= 85) {
    return "Healthy and easy to navigate.";
  }
  if (score >= 70) {
    return "Useful, but hard to navigate at scale.";
  }
  if (score >= 50) {
    return "Promising, but cleanup should start soon.";
  }
  return "Needs focused maintenance before it grows further.";
}

function scoreTextColor(score: number): string {
  if (score >= 80) {
    return "text-[var(--healthy)]";
  }
  if (score >= 60) {
    return "text-[var(--warning)]";
  }
  return "text-[var(--danger)]";
}

function scoreFill(score: number): string {
  if (score >= 80) {
    return "bg-[var(--healthy)]";
  }
  if (score >= 60) {
    return "bg-[var(--warning)]";
  }
  return "bg-[var(--danger)]";
}

function priorityClass(priority: "high" | "medium" | "low"): string {
  if (priority === "high") {
    return "bg-[var(--danger-soft)] text-[var(--danger)]";
  }
  if (priority === "medium") {
    return "bg-[var(--warning-soft)] text-[var(--warning)]";
  }
  return "bg-[var(--surface-muted)] text-[var(--muted)]";
}

function formatName(name: string): string {
  return name.replace(/([A-Z])/g, " $1").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
