#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const DIST = join(ROOT, "dist");
const SOURCE_ROOTS = [join(ROOT, "src/pages"), join(ROOT, "src/data")];

function walk(dir, accept) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...walk(path, accept));
    else if (accept(path)) files.push(path);
  }
  return files;
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function sourceIssues(text) {
  const rules = [
    { code: "P1", pattern: /\[要確認(?:\s*:|\])/g },
    { code: "P1", pattern: /\bFACTCHECK\b/gi },
    { code: "P1:known-chart-error", pattern: /Billboard\s*200(?:で)?最高3位/g },
    { code: "P2", pattern: /\b(?:url|href)\s*=\s*["']\s*(?:#|javascript:[^"']*)\s*["']/gi },
  ];
  const issues = [];
  for (const rule of rules) {
    for (const match of text.matchAll(rule.pattern)) {
      issues.push({ code: rule.code, line: lineNumber(text, match.index ?? 0) });
    }
  }
  return issues;
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=(["'])(.*?)\\1`, "i"))?.[2] ?? null;
}

function decodeAttribute(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#38;", "&")
    .replaceAll("&#x26;", "&");
}

function affiliateIssues(tag) {
  const href = decodeAttribute(attribute(tag, "href") ?? "");
  const merchant = attribute(tag, "data-affiliate-merchant");
  const looksAffiliate = Boolean(merchant)
    || /amazon\.co\.jp\/.*[?&]tag=/i.test(href)
    || /jp\.mercari\.com\/.*[?&]afid=/i.test(href);
  if (!looksAffiliate) return [];

  const issues = [];
  const position = attribute(tag, "data-affiliate-position");
  const item = attribute(tag, "data-affiliate-item");
  const rel = new Set((attribute(tag, "rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean));

  if (!merchant) issues.push("P3:merchant");
  if (!position) issues.push("P3:position");
  if (!item) issues.push("P3:item");
  for (const token of ["sponsored", "nofollow", "noopener"]) {
    if (!rel.has(token)) issues.push(`P3:rel-${token}`);
  }

  if (!/^https:\/\//i.test(href)) {
    issues.push("P2:url");
    return issues;
  }

  try {
    const url = new URL(href);
    if (merchant === "amazon") {
      if (url.searchParams.get("tag") !== "wax1124-22") issues.push("P3:amazon-tag");
      if (url.pathname === "/s" && !url.searchParams.get("k")?.trim()) issues.push("P2:amazon-query");
    }
    if (merchant === "mercari") {
      if (url.searchParams.get("afid") !== "3150124771") issues.push("P3:mercari-afid");
      if (!url.searchParams.get("keyword")?.trim()) issues.push("P2:mercari-query");
    }
  } catch {
    issues.push("P2:url");
  }

  return issues;
}

function runSelfTest() {
  assert.deepEqual(sourceIssues("<VodCta url=\"#\" />").map((x) => x.code), ["P2"]);
  assert.deepEqual(sourceIssues("text [要確認: date]").map((x) => x.code), ["P1"]);
  assert.deepEqual(sourceIssues("Billboard 200最高3位").map((x) => x.code), ["P1:known-chart-error"]);
  assert.deepEqual(
    affiliateIssues('<a href="https://www.amazon.co.jp/s?k=Nas&#38;tag=wax1124-22" rel="sponsored nofollow noopener" data-affiliate-merchant="amazon" data-affiliate-item="album" data-affiliate-position="inline">'),
    [],
  );
  assert(affiliateIssues('<a href="#" data-affiliate-merchant="u-next">').includes("P2:url"));
  console.log("✅ publish safety self-test");
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

const failures = [];
for (const root of SOURCE_ROOTS) {
  for (const file of walk(root, (path) => /\.(astro|ts|js|mjs|json)$/.test(path))) {
    const text = readFileSync(file, "utf8");
    for (const issue of sourceIssues(text)) {
      failures.push({ location: `${relative(ROOT, file)}:${issue.line}`, code: issue.code });
    }
  }
}

if (!existsSync(DIST)) {
  failures.push({ location: "dist", code: "P0:missing-build" });
} else {
  const home = join(DIST, "index.html");
  if (!existsSync(home) || !readFileSync(home, "utf8").includes("affiliate_click")) {
    failures.push({ location: "dist/index.html", code: "P3:tracking-script" });
  }
  for (const file of walk(DIST, (path) => path.endsWith(".html"))) {
    const html = readFileSync(file, "utf8");
    for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
      for (const code of affiliateIssues(match[0])) {
        failures.push({ location: relative(DIST, file), code });
      }
    }
  }
}

for (const config of ["vercel.json", "public/_headers"]) {
  const path = join(ROOT, config);
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (!/script-src[^;]*https:\/\/www\.googletagmanager\.com/.test(text)) {
    failures.push({ location: config, code: "P4:gtm-script-csp" });
  }
  if (!/connect-src[^;]*https:\/\/\*\.google-analytics\.com/.test(text)) {
    failures.push({ location: config, code: "P4:ga-connect-csp" });
  }
}

const adsTxt = join(ROOT, "public/ads.txt");
if (!existsSync(adsTxt) || !readFileSync(adsTxt, "utf8").includes("pub-7526742711058970")) {
  failures.push({ location: "public/ads.txt", code: "P5:ads-txt" });
}

if (failures.length) {
  console.error(`❌ publish safety: ${failures.length}件`);
  for (const failure of failures) console.error(`   ${failure.code} ${failure.location}`);
  process.exit(1);
}

console.log("✅ publish safety: unresolved facts 0 / invalid CTA 0 / affiliate tracking OK / CSP OK / ads.txt OK");
