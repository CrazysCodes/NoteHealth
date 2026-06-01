import type { HealthReport } from "./types";

/**
 * 将健康报告导出为 Markdown，供用户复制到 Obsidian、Git 仓库或普通文档中。
 */
export function generateHealthReportMarkdown(report: HealthReport): string {
  const categoryLines = Object.entries(report.categories)
    .map(([name, score]) => `- ${titleCase(name)}: ${score}/100`)
    .join("\n");

  const metricLines = Object.entries(report.metrics)
    .map(([name, value]) => `- ${titleCase(name)}: ${value}`)
    .join("\n");

  const issueLines = report.issues.length
    ? report.issues
        .map(
          (issue) =>
            `### ${issue.title}\n\n- Priority: ${titleCase(issue.priority)}\n- Evidence: ${issue.evidence}\n- Impact: ${issue.impact}`,
        )
        .join("\n\n")
    : "No issues detected by the MVP rules.";

  const actionLines = report.actions
    .map((action, index) => {
      const checklist = action.checklist.length
        ? action.checklist.map((item) => `- [ ] ${item}`).join("\n")
        : "- [ ] No matching notes in this scan.";

      return `### ${index + 1}. ${action.title}\n\n${action.why}\n\nAffected items: ${action.noteCount}\n\n${checklist}`;
    })
    .join("\n\n");

  return `# NoteHealth Report

Knowledge Health Score: ${report.score}/100

## Category Scores

${categoryLines}

## Key Metrics

${metricLines}

## Issues

${issueLines}

## Cleanup Plan

${actionLines}
`;
}

function titleCase(value: string): string {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}
