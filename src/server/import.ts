// Folder import: reads .md, .txt, .html/.htm and .docx files into pieces, one source path per file so re-runs skip or update.
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import mammoth from 'mammoth';
import { parse, NodeType } from 'node-html-parser';
import type { HTMLElement, Node as HtmlNode } from 'node-html-parser';
import type { Privacy, Store } from '../core';
import type { Service } from './service';

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: Array<{ path: string; error: string }>;
}

export const SERVER_RUNNING_MESSAGE =
  'The Thought-line server is running. Stop it before importing; it must be the only writer.';

const EXTENSIONS = new Set(['.md', '.txt', '.html', '.htm', '.docx']);
const SKIPPED_DIRS = new Set(['node_modules']);
const MAX_ERROR_CHARS = 300;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const describe = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, MAX_ERROR_CHARS);
const fileTitle = (filePath: string) => path.basename(filePath, path.extname(filePath));

/** One spelling of every newline, no BOM, no run of three or more newlines, nothing at either end. */
function tidy(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Block-level tags start and end a paragraph; everything else flows into the line it sits in. */
const BLOCKS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DETAILS', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE',
  'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'LI', 'MAIN', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TR', 'UL',
]);
const PRE_START = '\u0001';
const PRE_END = '\u0002';
const PRE_MARKS = /[\u0001\u0002]/g;
const DROPPED = ['script', 'style', 'nav', 'header', 'footer'];

function htmlToText(node: HtmlNode): string {
  if (node.nodeType === NodeType.TEXT_NODE) return node.text.replace(PRE_MARKS, '').replace(/[ \t\r\n\f]+/g, ' ');
  if (node.nodeType !== NodeType.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  const tag = el.tagName ?? '';
  if (tag === 'BR') return '\n';
  // Verse and code keep their line breaks and indentation; the marks tell fromHtml to leave the inside alone.
  if (tag === 'PRE') return `\n\n${PRE_START}${el.text.replace(PRE_MARKS, '').replace(/\r\n?/g, '\n')}${PRE_END}\n\n`;
  const inner = el.childNodes.map(htmlToText).join('');
  return BLOCKS.has(tag) ? `\n\n${inner}\n\n` : inner;
}

const insideChrome = (el: HTMLElement) => {
  for (let p = el.parentNode as HTMLElement | null; p; p = p.parentNode as HTMLElement | null) {
    if (['NAV', 'HEADER', 'FOOTER'].includes(p.tagName ?? '')) return true;
  }
  return false;
};

function fromHtml(raw: string, filePath: string): { title: string; text: string } {
  const doc = parse(raw);
  const article = doc.querySelector('article');
  const body = doc.querySelector('body');
  const content = article ?? body ?? doc;

  // The title is found before the page furniture is dropped: a post's own <h1> often sits in its <header>.
  const h1 = content.querySelectorAll('h1')
    .filter(h => article !== null || !insideChrome(h))
    .map(h => h.text.replace(/\s+/g, ' ').trim())
    .find(t => t !== '');
  const pageTitle = doc.querySelector('title')?.text.replace(/\s+/g, ' ').trim();
  const title = h1 || pageTitle || fileTitle(filePath);

  for (const tag of DROPPED) for (const el of content.querySelectorAll(tag)) el.remove();
  // Outside <pre> every line is trimmed; inside, only the line ends and the ends of the block are.
  const text = htmlToText(content).split(/(\u0001[\s\S]*?\u0002)/).map((part, i) => i % 2 === 1
    ? part.slice(1, -1).split('\n').map(line => line.trimEnd()).join('\n').replace(/^\n+|\s+$/g, '')
    : part.split('\n').map(line => line.trim()).join('\n')).join('');
  return { title, text: tidy(text) };
}

function fromMarkdown(raw: string, filePath: string): { title: string; text: string } {
  const text = tidy(raw);
  const heading = /^#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/m.exec(text)?.[1].trim();
  return { title: heading || fileTitle(filePath), text };
}

/** The title and plain text of one file. Null for a type the importer does not read. */
export async function extractText(filePath: string): Promise<{ title: string; text: string } | null> {
  switch (path.extname(filePath).toLowerCase()) {
    case '.md':
      return fromMarkdown(await fs.readFile(filePath, 'utf8'), filePath);
    case '.txt':
      return { title: fileTitle(filePath), text: tidy(await fs.readFile(filePath, 'utf8')) };
    case '.html':
    case '.htm':
      return fromHtml(await fs.readFile(filePath, 'utf8'), filePath);
    case '.docx':
      return { title: fileTitle(filePath), text: tidy((await mammoth.extractRawText({ path: filePath })).value) };
    default:
      return null;
  }
}

/** Every readable file under `dir`, in a stable order. Hidden files and folders, Word lock files and node_modules are left out. */
async function walk(dir: string, failed: ImportResult['failed']): Promise<string[]> {
  const found: string[] = [];
  let entries;
  try {
    entries = (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  } catch (err) {
    // A locked or vanished folder costs only its own files.
    failed.push({ path: dir, error: describe(err) });
    return found;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name.startsWith('~$')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) found.push(...await walk(full, failed));
    } else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      found.push(full);
    }
  }
  return found;
}


/**
 * Imports every supported file under `folder`. A file's source path is its real path on disk (`realpath` gives the
 * on-disk casing on Windows), so the same file is found again however the folder is spelled. An unchanged file is
 * skipped; a changed one has its text updated (its privacy is left as it was). One bad file never stops the run.
 */
export async function importFolder(
  deps: { service: Service; store: Store },
  folder: string,
  opts: { privacy: Privacy; analyze?: boolean },
): Promise<ImportResult> {
  const { service, store } = deps;
  let root: string;
  try {
    root = await fs.realpath(folder);
    if (!(await fs.stat(root)).isDirectory()) throw new Error('not a folder');
  } catch (err) {
    throw new Error(`Cannot read the folder ${folder}: ${describe(err)}`);
  }

  const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: [] };
  for (const file of await walk(root, result.failed)) {
    let pieceId: string | undefined;
    let canonical = file;
    try {
      canonical = await fs.realpath(file);
      if ((await fs.stat(canonical)).size > MAX_FILE_BYTES) throw new Error('File is larger than 5 MB');
      const extracted = await extractText(canonical);
      if (!extracted) continue;
      if (extracted.text === '') throw new Error('No text found in the file');

      const existing = await store.findPieceBySourcePath(canonical);
      if (!existing) {
        pieceId = (await service.createPiece({
          title: extracted.title, text: extracted.text, privacy: opts.privacy, source: { kind: 'import', path: canonical },
        })).id;
        result.created++;
      } else if (existing.text !== extracted.text) {
        pieceId = (await service.updateText(existing.id, extracted.text)).id;
        result.updated++;
      } else {
        result.skipped++;
      }
    } catch (err) {
      result.failed.push({ path: canonical, error: describe(err) });
      continue;
    }
    if (opts.analyze && pieceId) {
      try {
        await service.analyze(pieceId);
      } catch (err) {
        // The piece is saved; only its analysis failed.
        result.failed.push({ path: canonical, error: `analysis failed: ${describe(err)}` });
      }
    }
  }
  return result;
}

export type Connector = (host: string, port: number) => Promise<boolean>;

const CONNECT_TIMEOUT_MS = 1500;

/** True when something accepts a TCP connection at host:port. */
const tcpConnect: Connector = (host, port) => new Promise(resolve => {
  const socket = net.connect({ host, port });
  const done = (answered: boolean) => { socket.destroy(); resolve(answered); };
  socket.setTimeout(CONNECT_TIMEOUT_MS);
  socket.once('connect', () => done(true));
  socket.once('timeout', () => done(false));
  socket.once('error', () => done(false));
});

/** The store's write locks are per process, so the importer must not write while the server holds the data folder. */
export function serverIsRunning(host: string, port: number, connect: Connector = tcpConnect): Promise<boolean> {
  return connect(host, port);
}
