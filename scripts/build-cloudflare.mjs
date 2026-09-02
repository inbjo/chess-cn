#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const outputDir = join(repoRoot, 'dist-cloudflare');
const stagingDir = mkdtempSync(join(repoRoot, '.dist-cloudflare-'));
const staticEntries = [
  'index.html',
  'favicon.svg',
  'css',
  'js',
  'assets',
  'vendor',
  'media',
  'LICENSE',
  'DISTRIBUTION-NOTICE.md',
  'LICENSES',
];

function replaceExactlyOnce(source, needle, replacement, description) {
  const first = source.indexOf(needle);
  if (first === -1 || source.indexOf(needle, first + needle.length) !== -1) {
    throw new Error(`无法唯一定位${description}，请同步更新 Cloudflare 构建脚本`);
  }
  return source.replace(needle, replacement);
}

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (lstatSync(path).isDirectory()) files.push(...listFiles(path));
    else files.push(path);
  }
  return files;
}

try {
  for (const entry of staticEntries) {
    cpSync(join(repoRoot, entry), join(stagingDir, entry), { recursive: true });
  }

  const indexPath = join(stagingDir, 'index.html');
  let html = readFileSync(indexPath, 'utf8');
  html = replaceExactlyOnce(
    html,
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <meta name="chess-deployment" content="cloudflare-static" />',
    '页面部署标记插入点',
  );
  html = replaceExactlyOnce(
    html,
    '          <button id="btnModeOnline" class="mode-option" type="button" data-mode="online" aria-pressed="false">联机</button>\n',
    '',
    '联机模式入口',
  );
  html = replaceExactlyOnce(
    html,
    '            <option value="pikafish">Pikafish</option>\n',
    '',
    'Pikafish 引擎入口',
  );
  writeFileSync(indexPath, html);

  const files = listFiles(stagingDir);
  const oversized = files.find(path => statSync(path).size > 25 * 1024 * 1024);
  if (oversized) throw new Error(`静态资源超过 Cloudflare 25 MiB 限制：${oversized}`);
  if (files.length > 20_000) throw new Error(`静态资源数量 ${files.length} 超过 Cloudflare 免费版限制`);
  if (html.includes('id="btnModeOnline"') || html.includes('value="pikafish"')) {
    throw new Error('Cloudflare 产物仍包含服务端功能入口');
  }

  rmSync(outputDir, { recursive: true, force: true });
  renameSync(stagingDir, outputDir);
  const totalBytes = files.reduce((sum, path) => sum + statSync(path.replace(stagingDir, outputDir)).size, 0);
  console.log(`Cloudflare Pages 专版已生成：${outputDir}`);
  console.log(`静态资源：${files.length} 个文件，${(totalBytes / 1024 / 1024).toFixed(1)} MiB`);
  console.log('功能范围：godogpaw 人机、本地双人');
} finally {
  if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true, force: true });
}
