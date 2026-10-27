import { readFile } from 'node:fs/promises';

const reportPath = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME || 'test-results/browser/playwright-results.json';
let report;
try {
  report = JSON.parse(await readFile(reportPath, 'utf8'));
} catch (error) {
  const message = `Playwright JSON diagnostics unavailable at ${reportPath}: ${error.message}`;
  console.log(`::error title=Playwright diagnostics::${message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
  process.exit(0);
}

const failures = [];
function visit(suite) {
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      for (const result of test.results || []) {
        if (['failed', 'timedOut', 'interrupted'].includes(result.status)) {
          const details = (result.errors || []).map((error) => error.message || JSON.stringify(error)).join('\n');
          failures.push(`${spec.title} [${result.status}]${details ? `\n${details}` : ''}`);
        }
      }
    }
  }
  for (const child of suite.suites || []) visit(child);
}
for (const suite of report.suites || []) visit(suite);

const diagnostics = failures.length ? failures.join('\n\n').slice(0, 3500) : 'Playwright failed but did not report a test failure entry.';
const escaped = diagnostics.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
console.log(`::error title=Playwright failure diagnostics::${escaped}`);
