#!/usr/bin/env node
import fs from 'node:fs';
import { execSync } from 'node:child_process';

function extractCacheName(fileContent, label) {
  const match = fileContent.match(/const\s+CACHE_NAME\s*=\s*['\"]([^'\"]+)['\"]/);
  if (!match) {
    throw new Error(`Unable to find CACHE_NAME in ${label}`);
  }
  return match[1];
}

function readBaseServiceWorker(baseRef) {
  try {
    return execSync(`git show origin/${baseRef}:service-worker.js`, { encoding: 'utf8' });
  } catch {
    throw new Error(
      `Unable to read service-worker.js from origin/${baseRef}. ` +
      `Ensure the base branch is fetched (current BASE_REF/GITHUB_BASE_REF: ${baseRef}).`
    );
  }
}

const baseRef = process.env.GITHUB_BASE_REF || process.env.BASE_REF || 'main';
const headServiceWorker = fs.readFileSync('service-worker.js', 'utf8');
const baseServiceWorker = readBaseServiceWorker(baseRef);

const headCacheName = extractCacheName(headServiceWorker, 'HEAD service-worker.js');
const baseCacheName = extractCacheName(baseServiceWorker, `origin/${baseRef} service-worker.js`);

if (headCacheName === baseCacheName) {
  console.error(
    `\nCACHE_NAME was not bumped for this PR.\n` +
    `Base (${baseRef}): ${baseCacheName}\n` +
    `Head: ${headCacheName}\n\n` +
    `Update CACHE_NAME in service-worker.js (example: binmanager-v27).\n`
  );
  process.exit(1);
}

console.log(`CACHE_NAME bump detected: ${baseCacheName} -> ${headCacheName}`);
