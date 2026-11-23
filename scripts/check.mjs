#!/usr/bin/env node
/**
 * Repository self-check: run with plain `node scripts/check.mjs`.
 *
 * Verifies the manifest, bundle patch, client bundle identity, locales, icon,
 * README-referenced screenshots and JS syntax.
 *
 * Prints `check: OK (<n> assertions)`; failures set `process.exitCode = 1`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = '@jianghuifr/dsh-ui-optimize';
const ROW_ID = 'dsh-ui-optimize';
const HAS_ASSETS = false;
const ICON_SIZE_LIMIT = 256 * 1024;
const EXPECTED_COUNTS = {
  definitions: 1251,
  fileNames: 2135,
  fileExtensions: 1377,
  folderNames: 4654,
  folderNamesExpanded: 4654,
};

let assertions = 0;
const failures = [];

function check(label, fn) {
  assertions += 1;
  try { fn(); } catch (error) { failures.push(`${label}: ${error.message}`); }
}
function ok(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message || 'value mismatch'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function readJson(file) { return JSON.parse(readFileSync(file, 'utf8')); }
function walk(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

// 1. Syntax.
const sources = ['lib', 'scripts', 'test'].flatMap((dir) => walk(join(ROOT, dir))).filter((file) => /\.(?:js|mjs)$/.test(file));
check('find JS sources', () => ok(sources.length > 0, 'no JS files found'));
for (const file of sources) {
  check(`syntax ${relative(ROOT, file)}`, () => {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    ok(result.status === 0, (result.stderr || result.stdout || `node --check exited ${result.status}`).trim());
  });
}

// 2. Manifest.
let pkg = {};
check('package.json parses', () => {
  pkg = readJson(join(ROOT, 'package.json'));
  ok(pkg && typeof pkg === 'object' && !Array.isArray(pkg), 'package.json must be an object');
});
check('identity and publish metadata', () => {
  equal(pkg.name, NAME, 'name');
  ok(typeof pkg.version === 'string' && /^\d+\.\d+\.\d+(?:[-+].*)?$/.test(pkg.version), 'version must be semver');
  equal(pkg.license, 'MIT', 'license');
  equal(pkg.private, undefined, 'package must be publishable');
  equal(pkg.type, 'module', 'type');
  equal(pkg.publishConfig && pkg.publishConfig.access, 'public', 'publishConfig.access');
  equal(pkg.publishConfig && pkg.publishConfig.registry, 'https://registry.npmjs.org/', 'publishConfig.registry');
  ok(pkg.repository && /github\.com/.test(pkg.repository.url || ''), 'repository.url');
});
check('main/icon files exist', () => {
  for (const key of ['main', 'icon']) {
    ok(typeof pkg[key] === 'string' && existsSync(join(ROOT, pkg[key])), `missing ${key}`);
  }
});
check('exports targets exist', () => {
  ok(pkg.exports && typeof pkg.exports === 'object', 'missing exports');
  for (const [key, target] of Object.entries(pkg.exports)) {
    ok(typeof target === 'string' && target.startsWith('./'), `${key} must be a './' target`);
    const fileName = basename(target);
    const dir = join(ROOT, dirname(target));
    if (!fileName.includes('*')) { ok(existsSync(join(ROOT, target)), `${key}: missing ${target}`); continue; }
    ok(existsSync(dir), `${key}: missing directory ${dirname(target)}`);
    const star = fileName.indexOf('*');
    const matches = readdirSync(dir).filter((name) => name.startsWith(fileName.slice(0, star)) && name.endsWith(fileName.slice(star + 1)));
    ok(matches.length > 0, `${key}: no files match ${target}`);
  }
});
check('files cover every shipped path', () => {
  ok(Array.isArray(pkg.files) && pkg.files.length > 0, 'missing files array');
  for (const entry of pkg.files) ok(existsSync(join(ROOT, entry)), `files entry not found: ${entry}`);
  for (const required of ['lib/index.js', 'lib/client.js', 'cordis.patch.yml', 'icon.svg', 'README.md', 'LICENSE']) {
    ok(pkg.files.some((entry) => required === entry || required.startsWith(entry.replace(/\/$/, '') + '/')), `files must include ${required}`);
  }
  if (HAS_ASSETS) ok(pkg.files.includes('assets/'), 'icon package must ship assets/');
});
check('dsh manifest is a web bundle', () => {
  const patch = pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch;
  ok(typeof patch === 'string' && existsSync(join(ROOT, patch)), 'missing dsh.bundle.patch');
  equal(pkg.dsh && pkg.dsh.client && pkg.dsh.client.platform, 'web', 'dsh.client.platform');
  const range = pkg.engines && pkg.engines.dsh;
  ok(typeof range === 'string' && /\d/.test(range), 'engines.dsh must be a semver range');
});
check('client bundle registers under the package name', () => {
  const client = readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8');
  ok(client.includes(`id: '${NAME}'`) || client.includes(`id: "${NAME}"`), 'client must register its package name');
  ok(client.includes('window.__ModuleLoader__.load('), 'client must be a classic loader bundle');
  ok(!/^\s*import\s/mu.test(client), 'client must not use ESM imports');
  ok(!client.includes("'/material-icons"), 'client must not use the retired /material-icons prefix');
});
check('cordis.patch.yml inserts its loader row', () => {
  const file = join(ROOT, 'cordis.patch.yml');
  ok(existsSync(file), 'missing cordis.patch.yml');
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  ok(lines.includes('- insert:'), "missing '- insert:' line");
  ok(lines.some((line) => line.replace(/^-\s*/, '') === `id: ${ROW_ID}`), `missing id: ${ROW_ID}`);
  ok(lines.some((line) => line.includes(`name: '${NAME}'`)), `missing name: ${NAME}`);
});
check('locale en/zh carry meta title and description', () => {
  for (const lang of ['en', 'zh']) {
    const meta = readJson(join(ROOT, 'locale', `${lang}.json`)).meta;
    ok(meta && typeof meta.title === 'string' && meta.title.trim().length > 0, `locale/${lang} meta.title`);
    ok(meta && typeof meta.description === 'string' && meta.description.trim().length > 0, `locale/${lang} meta.description`);
  }
});
check('icon.svg is a safe 64x64 SVG', () => {
  const file = join(ROOT, 'icon.svg');
  const svg = readFileSync(file, 'utf8');
  ok(statSync(file).size < ICON_SIZE_LIMIT, 'icon.svg too large');
  ok(svg.trimStart().startsWith('<svg'), 'icon.svg must start with <svg');
  ok(/viewBox\s*=\s*"0 0 64 64"/.test(svg), 'icon.svg must declare viewBox="0 0 64 64"');
  ok(!/<script/i.test(svg) && !/foreignObject/i.test(svg) && !/\son[a-z]+\s*=/i.test(svg), 'icon.svg must be inert');
});

if (HAS_ASSETS) {
  const assetsDir = join(ROOT, 'assets');
  const iconsDir = join(assetsDir, 'icons');
  let index = {};
  check('assets/index.json has the expected table sizes', () => {
    index = readJson(join(assetsDir, 'index.json'));
    equal(index.version, '5.38.1', 'version');
    for (const [key, expected] of Object.entries(EXPECTED_COUNTS)) {
      equal(Object.keys(index[key] || {}).length, expected, `${key} count`);
    }
  });
  check('every definition is an existing icon', () => {
    for (const [id, iconName] of Object.entries(index.definitions)) {
      ok(typeof iconName === 'string' && iconName.length > 0 && !/[\\/]/.test(iconName), `bad definition ${id}`);
      const file = join(iconsDir, iconName);
      ok(existsSync(file) && statSync(file).size > 0, `missing icon: ${iconName}`);
    }
  });
  check('defaults point at vendored icons', () => {
    for (const key of ['file', 'folder', 'folderOpen']) {
      ok(existsSync(join(iconsDir, index.defaults[key])), `defaults.${key}`);
    }
  });
  check('assets/source.json describes the vendored extension', () => {
    const source = readJson(join(assetsDir, 'source.json'));
    equal(source.package, 'pkief.material-icon-theme', 'package');
    equal(source.version, '5.38.1', 'version');
    equal(source.license, 'MIT', 'license');
  });
}

check('README screenshots exist and are PNGs', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const refs = [...readme.matchAll(/\]\((docs\/[^)\s]+\.png)\)/g)].map((match) => match[1]);
  for (const ref of new Set(refs)) {
    const bytes = readFileSync(join(ROOT, ref));
    ok(bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50, `${ref} is not a PNG`);
  }
});

if (failures.length > 0) {
  console.error('check: FAILED');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(`check: ${failures.length} failed of ${assertions} assertions`);
  process.exitCode = 1;
} else {
  console.log(`check: OK (${assertions} assertions)`);
}
