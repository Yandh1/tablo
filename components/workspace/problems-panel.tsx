import type { ParserDiagnostic } from "@/domain/parser";

import styles from "./problems-panel.module.css";

export function ProblemsPanel({
  diagnostics,
  status,
}: {
  diagnostics: ParserDiagnostic[];
  status: "parsing" | "valid" | "invalid";
}) {
  const errors = diagnostics.filter((item) => item.severity === "error").length;
  const warnings = diagnostics.filter((item) => item.severity === "warning").length;

  return (
    <section className={styles.panel} aria-labelledby="problems-title">
      <div className={styles.header}>
        <h3 id="problems-title">Problems</h3>
        <span aria-live="polite">
          {status === "parsing" ? "Checking..." : `${errors} errors, ${warnings} warnings`}
        </span>
      </div>
      {diagnostics.length === 0 ? (
        <p className={styles.empty}>{status === "parsing" ? "Parsing PostgreSQL source." : "No problems found."}</p>
      ) : (
        <ol className={styles.list}>
          {diagnostics.map((diagnostic, index) => (
            <li className={styles.item} key={`${diagnostic.code}-${diagnostic.range.start.offset}-${index}`}>
              <span className={styles.severity} data-severity={diagnostic.severity}>{diagnostic.severity}</span>
              <code>{diagnostic.code}</code>
              <span className={styles.message}>{diagnostic.message}</span>
              <span className={styles.location}>Ln {diagnostic.range.start.line}, Col {diagnostic.range.start.column}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
