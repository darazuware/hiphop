#!/usr/bin/env node
// Google Search Console順位取得スクリプト（seo-rank-watchスキル専用）
// 依存: Node組み込みのみ（fetch / crypto）。googleapis等の外部パッケージ不要。
//
// Usage:
//   node fetch_gsc_ranks.mjs --repo <REPO_PATH> [--append] [--days 28] [--site https://example.com/]
//
// 認証:
//   GSC_SERVICE_ACCOUNT_KEY 環境変数に、Search Console APIが有効な
//   サービスアカウントのJSON鍵ファイルへのパスを設定する。
//   そのサービスアカウントのメールアドレスを、対象プロパティに
//   「フル」または「制限付き」ユーザーとしてSearch Consoleに追加しておくこと。

import { readFile, writeFile } from "node:fs/promises";
import { createSign } from "node:crypto";
import path from "node:path";

function parseArgs(argv) {
  const args = { days: 28, append: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo") args.repo = argv[++i];
    else if (a === "--append") args.append = true;
    else if (a === "--days") args.days = Number(argv[++i]);
    else if (a === "--site") args.site = argv[++i];
  }
  return args;
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

async function getAccessToken(keyPath) {
  const raw = await readFile(keyPath, "utf8");
  const key = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(key.private_key);
  const jwt = `${signingInput}.${signature.toString("base64url")}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth token exchange failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  return json.access_token;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

async function queryGSC({ accessToken, siteUrl, startDate, endDate }) {
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: ["query", "page"],
      rowLimit: 5000,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GSC query failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  return json.rows || [];
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw e;
  }
}

function normalize(s) {
  return (s || "").trim().toLowerCase();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.repo) {
    console.error("Usage: fetch_gsc_ranks.mjs --repo <REPO_PATH> [--append] [--days 28] [--site https://example.com/]");
    process.exit(1);
  }

  const keyPath = process.env.GSC_SERVICE_ACCOUNT_KEY;
  if (!keyPath) {
    console.error(
      "GSC_SERVICE_ACCOUNT_KEY is not set. Set it to the path of a Search Console-enabled service account JSON key, " +
        "or fall back to WebSearch for an approximate rank check."
    );
    process.exit(1);
  }

  const seoDir = path.join(args.repo, "data", "seo");
  const config = await readJson(path.join(seoDir, "config.json"), {});
  const siteUrl = args.site || process.env.GSC_SITE_URL || config.siteUrl;
  if (!siteUrl) {
    console.error("No siteUrl configured. Pass --site, set GSC_SITE_URL, or add siteUrl to data/seo/config.json.");
    process.exit(1);
  }

  const watchwords = await readJson(path.join(seoDir, "watchwords.json"), []);

  const end = new Date();
  end.setDate(end.getDate() - 2); // GSCデータは直近2日ほど遅延する
  const start = new Date(end);
  start.setDate(start.getDate() - (args.days - 1));

  const accessToken = await getAccessToken(keyPath);
  const rows = await queryGSC({
    accessToken,
    siteUrl,
    startDate: isoDate(start),
    endDate: isoDate(end),
  });

  const today = isoDate(new Date());
  const results = [];
  for (const w of watchwords) {
    const wq = normalize(w.keyword);
    const candidates = rows.filter((r) => normalize(r.keys[0]) === wq);
    let best = null;
    if (w.targetPage) {
      best = candidates.find((r) => r.keys[1] === w.targetPage) || null;
    }
    if (!best && candidates.length) {
      best = candidates.reduce((a, b) => (a.position <= b.position ? a : b));
    }
    results.push({
      keyword: w.keyword,
      targetPath: w.targetPage ?? null,
      priority: w.priority ?? null,
      rank: best ? Number(best.position.toFixed(1)) : null,
      impressions: best ? best.impressions : 0,
      clicks: best ? best.clicks : 0,
      ctr: best ? Number((best.ctr * 100).toFixed(2)) : null,
      matchedPage: best ? best.keys[1] : null,
    });
  }

  const watchedSet = new Set(watchwords.map((w) => normalize(w.keyword)));
  const discoveryCandidates = rows
    .filter((r) => !watchedSet.has(normalize(r.keys[0])) && r.position <= 20 && r.impressions > 0)
    .sort((a, b) => a.position - b.position)
    .slice(0, 20)
    .map((r) => ({
      keyword: r.keys[0],
      page: r.keys[1],
      rank: Number(r.position.toFixed(1)),
      impressions: r.impressions,
      clicks: r.clicks,
    }));

  if (args.append) {
    const historyFile = path.join(seoDir, "rank-history.json");
    const history = await readJson(historyFile, []);
    for (const r of results) {
      history.push({
        date: today,
        keyword: r.keyword,
        targetPath: r.targetPath,
        rank: r.rank,
        impressions: r.impressions,
        clicks: r.clicks,
        ctr: r.ctr,
        source: "gsc",
        windowDays: args.days,
      });
    }
    await writeFile(historyFile, JSON.stringify(history, null, 2) + "\n");
  }

  console.log(
    JSON.stringify(
      {
        date: today,
        windowDays: args.days,
        dateRange: { start: isoDate(start), end: isoDate(end) },
        appended: args.append,
        results,
        discoveryCandidates,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
