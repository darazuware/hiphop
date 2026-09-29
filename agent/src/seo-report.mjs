#!/usr/bin/env node
/**
 * GA4 + Search Console 週次/任意期間レポート（サービスアカウント認証）
 *
 * Usage:
 *   node agent/src/seo-report.mjs [--days 7] [--telegram]
 *
 * 必要な .env（agent/.env）:
 *   GOOGLE_SERVICE_ACCOUNT_KEY_PATH  … サービスアカウントJSON鍵のパス
 *   GA4_PROPERTY_ID                  … 例: 123456789（"properties/" なし）
 *   GSC_SITE_URL                     … 例: https://waxthink.com/ または sc-domain:waxthink.com
 *
 * サービスアカウントを GA4（閲覧者）と Search Console（閲覧者）両方に
 * 追加しておくこと。
 */
import { setDefaultResultOrder } from 'node:dns';
import net from 'node:net';
setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily?.(false);

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import { BetaAnalyticsDataClient } from '@google-analytics/data';

const AGENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(AGENT_ROOT, '.env') });

const KEY_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID;
const GSC_SITE_URL = process.env.GSC_SITE_URL;

const args = process.argv.slice(2);
const daysIdx = args.indexOf('--days');
const DAYS = daysIdx >= 0 ? parseInt(args[daysIdx + 1], 10) : 7;
const SEND_TELEGRAM = args.includes('--telegram');

if (!KEY_PATH || !existsSync(KEY_PATH)) {
  console.error('❌ GOOGLE_SERVICE_ACCOUNT_KEY_PATH が未設定、またはファイルが見つかりません（agent/.env）');
  process.exit(1);
}
if (!GA4_PROPERTY_ID) {
  console.error('❌ GA4_PROPERTY_ID が未設定です（agent/.env）');
  process.exit(1);
}
if (!GSC_SITE_URL) {
  console.error('❌ GSC_SITE_URL が未設定です（agent/.env）');
  process.exit(1);
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

async function fetchGA4() {
  const client = new BetaAnalyticsDataClient({ keyFilename: KEY_PATH });
  const [report] = await client.runReport({
    property: `properties/${GA4_PROPERTY_ID}`,
    dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }, { name: 'averageSessionDuration' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 10,
  });

  const [totals] = await client.runReport({
    property: `properties/${GA4_PROPERTY_ID}`,
    dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }, { name: 'sessions' }],
  });

  const totalRow = totals.rows?.[0]?.metricValues ?? [];
  return {
    totalPageViews: totalRow[0]?.value ?? '0',
    totalUsers: totalRow[1]?.value ?? '0',
    totalSessions: totalRow[2]?.value ?? '0',
    topPages: (report.rows ?? []).map((r) => ({
      path: r.dimensionValues[0].value,
      views: r.metricValues[0].value,
      users: r.metricValues[1].value,
    })),
  };
}

async function fetchGSC() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });
  const searchconsole = google.searchconsole({ version: 'v1', auth });

  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - DAYS);

  const totalsRes = await searchconsole.searchanalytics.query({
    siteUrl: GSC_SITE_URL,
    requestBody: {
      startDate: fmtDate(start),
      endDate: fmtDate(end),
    },
  });
  const t = totalsRes.data.rows?.[0] ?? {};

  const queryRes = await searchconsole.searchanalytics.query({
    siteUrl: GSC_SITE_URL,
    requestBody: {
      startDate: fmtDate(start),
      endDate: fmtDate(end),
      dimensions: ['query'],
      rowLimit: 10,
    },
  });

  const pageRes = await searchconsole.searchanalytics.query({
    siteUrl: GSC_SITE_URL,
    requestBody: {
      startDate: fmtDate(start),
      endDate: fmtDate(end),
      dimensions: ['page'],
      rowLimit: 10,
    },
  });

  return {
    clicks: t.clicks ?? 0,
    impressions: t.impressions ?? 0,
    ctr: t.ctr ?? 0,
    position: t.position ?? 0,
    topQueries: (queryRes.data.rows ?? []).map((r) => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      position: r.position,
    })),
    topPages: (pageRes.data.rows ?? []).map((r) => ({
      page: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      position: r.position,
    })),
  };
}

function buildReportText(ga4, gsc) {
  const lines = [];
  lines.push(`📊 WAX&THINK レポート（直近${DAYS}日）`);
  lines.push('');
  lines.push('■ GA4');
  lines.push(`PV: ${ga4.totalPageViews} / ユーザー: ${ga4.totalUsers} / セッション: ${ga4.totalSessions}`);
  lines.push('人気ページ TOP5:');
  ga4.topPages.slice(0, 5).forEach((p, i) => {
    lines.push(`  ${i + 1}. ${p.path} — ${p.views}PV`);
  });
  lines.push('');
  lines.push('■ サーチコンソール');
  lines.push(`クリック: ${gsc.clicks} / 表示回数: ${gsc.impressions} / CTR: ${(gsc.ctr * 100).toFixed(1)}% / 平均順位: ${gsc.position.toFixed(1)}`);
  lines.push('検索クエリ TOP5:');
  gsc.topQueries.slice(0, 5).forEach((q, i) => {
    lines.push(`  ${i + 1}. ${q.query} — ${q.clicks}クリック / 順位${q.position.toFixed(1)}`);
  });
  lines.push('流入ページ TOP5:');
  gsc.topPages.slice(0, 5).forEach((p, i) => {
    lines.push(`  ${i + 1}. ${p.page.replace(/^https?:\/\/[^/]+/, '')} — ${p.clicks}クリック`);
  });
  return lines.join('\n');
}

async function sendTelegram(text) {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_API_KEY;
  const CHAT_ID = (process.env.TELEGRAM_CHAT_ID || '').split(',')[0].trim();
  if (!TOKEN || !CHAT_ID) {
    console.error('⚠️ TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 未設定のため通知スキップ');
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text }),
  });
  if (!res.ok) {
    console.error('❌ Telegram送信失敗:', await res.text());
  }
}

const [ga4, gsc] = await Promise.all([fetchGA4(), fetchGSC()]);
const text = buildReportText(ga4, gsc);
console.log(text);

if (SEND_TELEGRAM) {
  await sendTelegram(text);
  console.log('\n✅ Telegramへ送信しました');
}
