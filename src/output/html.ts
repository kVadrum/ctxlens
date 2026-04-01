/**
 * HTML report generator for ctxlens.
 *
 * Produces a self-contained HTML file with an interactive treemap
 * visualization of token distribution. No external dependencies —
 * all CSS and JS are inlined. Opens in the default browser via
 * `ctxlens scan --report`.
 */

import type { BudgetResult } from "../core/budget.js";
import type { ModelInfo } from "../core/models.js";
import type { BudgetStatus } from "../core/budget.js";
import { formatTokens } from "../utils/format.js";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusEmoji(status: BudgetStatus): string {
  switch (status) {
    case "fits": return "&#x2713;";
    case "tight": return "&#x26A0;";
    case "exceeds": return "&#x2717;";
  }
}

function statusColor(status: BudgetStatus): string {
  switch (status) {
    case "fits": return "#22c55e";
    case "tight": return "#eab308";
    case "exceeds": return "#ef4444";
  }
}

interface TreeNode {
  name: string;
  path: string;
  tokens: number;
  lines?: number;
  children?: TreeNode[];
}

/**
 * Builds a tree structure from flat file list for the treemap.
 */
function buildTree(files: BudgetResult["files"]): TreeNode {
  const root: TreeNode = { name: "(root)", path: "", tokens: 0, children: [] };

  for (const file of files) {
    const parts = file.relativePath.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;

      if (isFile) {
        current.children!.push({
          name: part,
          path: file.relativePath,
          tokens: file.tokens,
          lines: file.lines,
        });
      } else {
        let child = current.children!.find((c) => c.name === part && c.children);
        if (!child) {
          child = { name: part, path: parts.slice(0, i + 1).join("/"), tokens: 0, children: [] };
          current.children!.push(child);
        }
        current = child;
      }
    }
  }

  // Roll up directory totals
  function rollUp(node: TreeNode): number {
    if (!node.children || node.children.length === 0) return node.tokens;
    node.tokens = node.children.reduce((sum, c) => sum + rollUp(c), 0);
    return node.tokens;
  }
  rollUp(root);

  return root;
}

/** Per-file token counts across different encodings, for the comparison table. */
export interface HtmlCompareEntry {
  relativePath: string;
  tokenCounts: Record<string, number>;
}

/**
 * Generates a complete self-contained HTML report.
 *
 * @param result         - The budget analysis result.
 * @param repositoryName - Name of the scanned repository.
 * @param multiModel     - Multi-model budget comparison data.
 * @param compare        - Optional tokenizer comparison data.
 * @returns Complete HTML string ready to write to a file.
 */
export function renderHtml(
  result: BudgetResult,
  repositoryName: string,
  multiModel: Array<{ model: ModelInfo; utilization: number; status: BudgetStatus }>,
  compare?: { entries: HtmlCompareEntry[]; encodings: string[] },
): string {
  const tree = buildTree(result.files);
  const treeJson = JSON.stringify(tree);

  // All directory rows for the table
  const dirRows = result.directories.slice(0, 15).map((d) => {
    const pct = (d.tokens / result.totalTokens) * 100;
    return `        <tr>
          <td>${escapeHtml(d.path)}</td>
          <td>${formatTokens(d.tokens)}</td>
          <td>${d.files}</td>
          <td>${pct.toFixed(1)}%</td>
          <td><div class="bar-bg"><div class="bar-fill" style="width: ${Math.min(pct, 100)}%"></div></div></td>
        </tr>`;
  }).join("\n");

  // All file rows for the table
  const fileRows = result.files.slice(0, 20).map((f) => {
    const pct = (f.tokens / result.totalTokens) * 100;
    return `        <tr>
          <td>${escapeHtml(f.relativePath)}</td>
          <td>${formatTokens(f.tokens)}</td>
          <td>${f.lines}</td>
          <td>${pct.toFixed(1)}%</td>
          <td><div class="bar-bg"><div class="bar-fill" style="width: ${Math.min(pct * 3, 100)}%"></div></div></td>
        </tr>`;
  }).join("\n");

  // Tokenizer comparison section
  let compareSection = "";
  if (compare && compare.entries.length > 0) {
    const { entries, encodings } = compare;
    const sorted = [...entries].sort((a, b) => {
      const aVals = Object.values(a.tokenCounts);
      const bVals = Object.values(b.tokenCounts);
      return (Math.max(...bVals) - Math.min(...bVals)) - (Math.max(...aVals) - Math.min(...aVals));
    });
    const top = sorted.slice(0, 15);
    const encHeaders = encodings.map((e) => `<th>${escapeHtml(e)}</th>`).join("");
    const compRows = top.map((entry) => {
      const vals = encodings.map((e) => entry.tokenCounts[e] ?? 0);
      const diff = Math.max(...vals) - Math.min(...vals);
      const diffPct = vals[0] > 0 ? `\u00b1${((diff / vals[0]) * 100).toFixed(1)}%` : "\u2014";
      const cols = encodings.map((e) => `<td>${formatTokens(entry.tokenCounts[e] ?? 0)}</td>`).join("");
      return `        <tr>
          <td>${escapeHtml(entry.relativePath)}</td>
          ${cols}
          <td style="color: ${diff > 0 ? "var(--yellow)" : "var(--text-dim)"}">${diff > 0 ? diffPct : "\u2014"}</td>
        </tr>`;
    }).join("\n");
    const totalCols = encodings.map((e) => {
      const t = entries.reduce((sum, entry) => sum + (entry.tokenCounts[e] ?? 0), 0);
      return `<td><strong>${formatTokens(t)}</strong></td>`;
    }).join("");
    const totalVals = encodings.map((e) => entries.reduce((sum, entry) => sum + (entry.tokenCounts[e] ?? 0), 0));
    const totalDiff = Math.max(...totalVals) - Math.min(...totalVals);
    const totalDiffPct = totalVals[0] > 0 ? `\u00b1${((totalDiff / totalVals[0]) * 100).toFixed(1)}%` : "\u2014";

    compareSection = `
  <div class="section">
    <div class="section-title">Tokenizer Comparison</div>
    <table>
      <thead><tr><th>File</th>${encHeaders}<th>Diff</th></tr></thead>
      <tbody>
${compRows}
        <tr style="border-top: 2px solid var(--border)">
          <td><strong>TOTAL</strong></td>
          ${totalCols}
          <td style="color: var(--yellow)"><strong>${totalDiff > 0 ? totalDiffPct : "\u2014"}</strong></td>
        </tr>
      </tbody>
    </table>
  </div>`;
  }

  // Budget status rows
  const budgetRows = multiModel.map((e) => {
    return `    <div class="budget-row">
      <span class="budget-icon" style="color: ${statusColor(e.status)}">${statusEmoji(e.status)}</span>
      <span class="budget-name">${escapeHtml(e.model.id)} (${formatTokens(e.model.contextWindow)})</span>
      <span class="budget-pct">${(e.utilization * 100).toFixed(1)}%</span>
    </div>`;
  }).join("\n");

  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const isoStr = new Date().toISOString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ctxlens report — ${escapeHtml(repositoryName)}</title>
<style>
  :root {
    --bg: #0f1117;
    --surface: #1a1d27;
    --border: #2a2d3a;
    --text: #e2e4e9;
    --text-dim: #8b8fa3;
    --accent: #6366f1;
    --green: #22c55e;
    --yellow: #eab308;
    --red: #ef4444;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
    font-size: 14px;
    line-height: 1.6;
    padding: 2rem;
  }
  .container { max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.25rem; }
  h1 span { color: var(--text-dim); font-weight: 400; }
  .subtitle { color: var(--text-dim); margin-bottom: 2rem; }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }
  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem 1.25rem;
  }
  .stat-card .label { color: var(--text-dim); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .stat-card .value { font-size: 1.5rem; font-weight: 600; margin-top: 0.25rem; }
  .section { margin-bottom: 2rem; }
  .section-title {
    color: var(--text-dim);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }
  #treemap {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    min-height: 400px;
    position: relative;
    overflow: hidden;
  }
  .tm-node {
    position: absolute;
    overflow: hidden;
    border: 1px solid var(--bg);
    cursor: pointer;
    transition: opacity 0.15s;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 4px;
  }
  .tm-node:hover { opacity: 0.85; }
  .tm-label {
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    color: #fff;
    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  }
  .tm-tokens {
    font-size: 10px;
    color: rgba(255,255,255,0.75);
    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  }
  .tooltip {
    position: fixed;
    background: #1e2030;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    font-size: 12px;
    pointer-events: none;
    z-index: 1000;
    display: none;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  }
  .tp-path { color: var(--accent); font-weight: 500; }
  .tp-detail { color: var(--text-dim); margin-top: 2px; }
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
    font-size: 0.8rem;
    color: var(--text-dim);
  }
  .breadcrumb span { cursor: pointer; }
  .breadcrumb span:hover { color: var(--accent); }
  .breadcrumb .sep { color: var(--border); }
  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }
  th {
    text-align: left;
    padding: 0.75rem 1rem;
    background: var(--bg);
    color: var(--text-dim);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 500;
  }
  td { padding: 0.5rem 1rem; border-top: 1px solid var(--border); }
  tr:hover td { background: rgba(99, 102, 241, 0.05); }
  .bar-bg {
    width: 100px;
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
    display: inline-block;
    vertical-align: middle;
  }
  .bar-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
  }
  .budget-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.4rem 0;
  }
  .budget-icon { font-size: 1rem; }
  .budget-name { color: var(--text); }
  .budget-pct { color: var(--text-dim); font-size: 0.85rem; }
  .footer {
    margin-top: 3rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
    color: var(--text-dim);
    font-size: 0.75rem;
  }
</style>
</head>
<body>
<div class="container">
  <h1>ctxlens <span>&mdash; ${escapeHtml(repositoryName)}</span></h1>
  <p class="subtitle">Token Budget Report &middot; ${dateStr}</p>

  <div class="stats">
    <div class="stat-card">
      <div class="label">Total Tokens</div>
      <div class="value">${formatTokens(result.totalTokens)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Files Scanned</div>
      <div class="value">${result.totalFiles}</div>
    </div>
    <div class="stat-card">
      <div class="label">Target Model</div>
      <div class="value">${escapeHtml(result.model.id)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Utilization</div>
      <div class="value" style="color: ${statusColor(result.status)}">${(result.utilization * 100).toFixed(1)}%</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Token Distribution Treemap</div>
    <div id="breadcrumb" class="breadcrumb"></div>
    <div id="treemap"></div>
  </div>

  <div class="section">
    <div class="section-title">Top Directories</div>
    <table>
      <thead><tr><th>Directory</th><th>Tokens</th><th>Files</th><th>Share</th><th></th></tr></thead>
      <tbody>
${dirRows}
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Largest Files</div>
    <table>
      <thead><tr><th>File</th><th>Tokens</th><th>Lines</th><th>Share</th><th></th></tr></thead>
      <tbody>
${fileRows}
      </tbody>
    </table>
  </div>

${compareSection}
  <div class="section">
    <div class="section-title">Budget Status</div>
${budgetRows}
  </div>

  <div class="footer">
    Generated by ctxlens &middot; ${isoStr}
  </div>
</div>

<div class="tooltip" id="tooltip">
  <div class="tp-path"></div>
  <div class="tp-detail"></div>
</div>

<script>
(function() {
  var treeData = ${treeJson};
  var totalTokens = ${result.totalTokens};
  var COLORS = [
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e', '#f97316', '#eab308',
    '#84cc16', '#22c55e', '#14b8a6', '#06b6d4',
    '#3b82f6', '#2563eb'
  ];

  var treemap = document.getElementById('treemap');
  var tooltipEl = document.getElementById('tooltip');
  var breadcrumbEl = document.getElementById('breadcrumb');
  var currentNode = treeData;
  var navStack = [];

  function squarify(children, x, y, w, h) {
    if (!children || children.length === 0) return [];
    var total = children.reduce(function(s, c) { return s + c.tokens; }, 0);
    if (total === 0) return [];
    var sorted = children.slice().sort(function(a, b) { return b.tokens - a.tokens; });
    var rects = [];
    var i = 0;
    var cx = x, cy = y, cw = w, ch = h;

    while (i < sorted.length) {
      var isWide = cw >= ch;
      var side = isWide ? ch : cw;
      var remaining = 0;
      for (var ri = i; ri < sorted.length; ri++) remaining += sorted[ri].tokens;

      var row = [sorted[i]];
      var rowSum = sorted[i].tokens;
      var bestWorst = Infinity;

      for (var j = i + 1; j < sorted.length; j++) {
        var testRow = row.concat([sorted[j]]);
        var testSum = rowSum + sorted[j].tokens;
        var rowArea = (testSum / remaining) * cw * ch;
        var rowSide = isWide ? rowArea / ch : rowArea / cw;
        var worst = 0;
        for (var ti = 0; ti < testRow.length; ti++) {
          var itemSide = (testRow[ti].tokens / testSum) * side;
          var ratio = Math.max(rowSide / itemSide, itemSide / rowSide);
          worst = Math.max(worst, ratio);
        }
        if (worst > bestWorst && bestWorst < Infinity) break;
        bestWorst = worst;
        row = testRow;
        rowSum = testSum;
      }

      var layoutArea = (rowSum / remaining) * cw * ch;
      var layoutSide = isWide ? layoutArea / ch : layoutArea / cw;
      var offset = 0;

      for (var k = 0; k < row.length; k++) {
        var frac = row[k].tokens / rowSum;
        var itemS = frac * side;
        if (isWide) {
          rects.push({ node: row[k], x: cx, y: cy + offset, w: layoutSide, h: itemS });
        } else {
          rects.push({ node: row[k], x: cx + offset, y: cy, w: itemS, h: layoutSide });
        }
        offset += itemS;
      }

      if (isWide) { cx += layoutSide; cw -= layoutSide; }
      else { cy += layoutSide; ch -= layoutSide; }
      i += row.length;
    }
    return rects;
  }

  function formatTk(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  function showTooltip(e, node) {
    tooltipEl.style.display = 'block';
    tooltipEl.querySelector('.tp-path').textContent = node.path || node.name;
    var pct = ((node.tokens / totalTokens) * 100).toFixed(1);
    var detail = node.children
      ? formatTk(node.tokens) + ' tokens (' + pct + '%) \\u00b7 ' + node.children.length + ' items'
      : formatTk(node.tokens) + ' tokens (' + pct + '%)' + (node.lines ? ' \\u00b7 ' + node.lines + ' lines' : '');
    tooltipEl.querySelector('.tp-detail').textContent = detail;
    moveTooltip(e);
  }

  function moveTooltip(e) {
    tooltipEl.style.left = (e.clientX + 12) + 'px';
    tooltipEl.style.top = (e.clientY + 12) + 'px';
  }

  function hideTooltip() { tooltipEl.style.display = 'none'; }

  function renderTreemap(node) {
    currentNode = node;
    // Clear treemap using DOM methods
    while (treemap.firstChild) treemap.removeChild(treemap.firstChild);

    var rect = treemap.getBoundingClientRect();
    var w = rect.width || 800;
    var h = 400;
    treemap.style.height = h + 'px';
    var items = node.children || [];
    var rects = squarify(items, 0, 0, w, h);

    rects.forEach(function(r, idx) {
      var div = document.createElement('div');
      div.className = 'tm-node';
      div.style.left = r.x + 'px';
      div.style.top = r.y + 'px';
      div.style.width = r.w + 'px';
      div.style.height = r.h + 'px';
      div.style.background = COLORS[idx % COLORS.length];

      if (r.w > 50 && r.h > 24) {
        var label = document.createElement('div');
        label.className = 'tm-label';
        label.textContent = r.node.name;
        div.appendChild(label);
        if (r.w > 60 && r.h > 36) {
          var tkLabel = document.createElement('div');
          tkLabel.className = 'tm-tokens';
          tkLabel.textContent = formatTk(r.node.tokens);
          div.appendChild(tkLabel);
        }
      }

      div.addEventListener('mouseenter', function(e) { showTooltip(e, r.node); });
      div.addEventListener('mousemove', moveTooltip);
      div.addEventListener('mouseleave', hideTooltip);

      if (r.node.children && r.node.children.length > 0) {
        div.addEventListener('click', function() {
          navStack.push(node);
          renderTreemap(r.node);
          renderBreadcrumb();
        });
      }

      treemap.appendChild(div);
    });
  }

  function renderBreadcrumb() {
    while (breadcrumbEl.firstChild) breadcrumbEl.removeChild(breadcrumbEl.firstChild);

    for (var i = 0; i < navStack.length; i++) {
      (function(idx) {
        var span = document.createElement('span');
        span.textContent = navStack[idx].name || '(root)';
        span.addEventListener('click', function() {
          var target = navStack[idx];
          navStack = navStack.slice(0, idx);
          renderTreemap(target);
          renderBreadcrumb();
        });
        breadcrumbEl.appendChild(span);
        var sep = document.createElement('span');
        sep.className = 'sep';
        sep.textContent = ' / ';
        breadcrumbEl.appendChild(sep);
      })(i);
    }
    var cur = document.createElement('span');
    cur.textContent = currentNode.name || '(root)';
    cur.style.color = '#e2e4e9';
    breadcrumbEl.appendChild(cur);
  }

  renderTreemap(treeData);
  renderBreadcrumb();
  window.addEventListener('resize', function() { renderTreemap(currentNode); renderBreadcrumb(); });
})();
</script>
</body>
</html>`;
}
