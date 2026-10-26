// OCT Medley — catalog builder (GitHub Actions 用)
// songs/*.oct8 を読み、暗号化カタログ catalog.oct8c と index.json を _site/ に生成する。
// カタログは毎回ファイルから作り直すため、古い情報や削除済みの曲が残ることはない。
import { readdir, readFile, mkdir, writeFile, copyFile, stat, cp, rm } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import path from 'node:path';

const subtle = (globalThis.crypto || webcrypto).subtle;
const getRandomValues = a => (globalThis.crypto || webcrypto).getRandomValues(a);
const OUT = process.env.OCT_OUT || '_site';
const PASS = process.env.OCT_PASSPHRASE || 'AudioCre8::OCT-Medley::Original-Chime-Tracks::v1';
const APP_HTML = process.env.OCT_APP_HTML || 'oct-medley.html';
const EXCLUDE = new Set(['.git', '.github', 'tools', 'node_modules', OUT]);
// 曲フォルダ：環境変数 → songs → song → .oct8 が入っている最初のフォルダ
async function findSongDir() {
  if (process.env.OCT_SONG_DIR) return process.env.OCT_SONG_DIR;
  const has = async d => (await readdir(d).catch(() => [])).some(f => /\.oct8$/i.test(f));
  for (const d of ['songs', 'song']) if (await has(d)) return d;
  for (const e of await readdir('.', { withFileTypes: true })) if (e.isDirectory() && !EXCLUDE.has(e.name) && await has(e.name)) return e.name;
  return 'songs';
}
const SONG_DIR = await findSongDir();
const TE = new TextEncoder(), TD = new TextDecoder();
const MAGIC_SONG = [0xAC, 0xC8, 0x0C, 0x7E], MAGIC_CAT = [0xAC, 0xC8, 0xCA, 0x7A];
const SONG_HDR = 72, SIMPLE_HDR = 40;
const MASK = (() => { const m = new Uint8Array(96); let x = 0x8C3A15E7; for (let i = 0; i < m.length; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; m[i] = x & 255; } return m; })();
const maskInPlace = (u8, a, b) => { for (let i = a; i < b; i++) u8[i] ^= MASK[i - a]; };
const dv = u8 => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
let baseKey;
async function key(salt, info) {
  if (!baseKey) baseKey = await subtle.importKey('raw', await subtle.digest('SHA-256', TE.encode(PASS)), 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: TE.encode(info) }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const stream = (u8, t) => new Response(new Blob([u8]).stream().pipeThrough(t)).arrayBuffer().then(b => new Uint8Array(b));

async function readLite(u8) {
  if (!MAGIC_SONG.every((b, i) => u8[i] === b)) throw new Error('OCT8 形式ではありません');
  const hd = u8.slice(0, SONG_HDR); maskInPlace(hd, 4, SONG_HDR); const d = dv(hd);
  const flags = hd[5], salt = hd.slice(8, 24), ivL = hd.slice(24, 36), lenL = d.getUint32(36), lenT = d.getUint32(52), lenA = d.getUint32(68);
  if (u8.length < SONG_HDR + lenL + lenT + lenA) throw new Error('ファイルが途中で切れています');
  const k = await key(salt, 'oct8/song');
  let b = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: ivL }, k, u8.subarray(SONG_HDR, SONG_HDR + lenL)));
  if (flags & 1) b = await stream(b, new DecompressionStream('deflate'));
  return JSON.parse(TD.decode(b));
}
async function buildCatalog(songs) {
  const salt = getRandomValues(new Uint8Array(16)), iv = getRandomValues(new Uint8Array(12)), k = await key(salt, 'oct8/catalog');
  const body = await stream(TE.encode(JSON.stringify({ format: 'oct8c', version: 1, updated: new Date().toISOString(), generator: 'actions', songs })), new CompressionStream('deflate'));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, k, body));
  const out = new Uint8Array(SIMPLE_HDR + ct.length); out.set(MAGIC_CAT, 0); out[4] = 1; out[5] = 1; out.set(salt, 8); out.set(iv, 24); dv(out).setUint32(36, ct.length);
  maskInPlace(out, 4, SIMPLE_HDR); out.set(ct, SIMPLE_HDR); return out;
}
const gitSha = u8 => createHash('sha1').update(`blob ${u8.length}\0`).update(u8).digest('hex');
const LITE = ['id', 'no', 'title', 'titleEn', 'composer', 'arranger', 'tags', 'desc', 'explicit', 'bpm', 'bpmSegments', 'meter', 'meterSegments', 'key', 'keySegments', 'downbeat', 'duration', 'trimStart', 'trimTail', 'mime', 'thumbMime', 'thumbS', 'created', 'updated', 'fmt'];

const files = (await readdir(SONG_DIR).catch(() => [])).filter(f => /\.oct8$/i.test(f)).sort();
// リポジトリ内のファイル（index.html など既存のサイト）をそのまま公開物に含める
await rm(OUT, { recursive: true, force: true }); await mkdir(OUT, { recursive: true });
for (const e of await readdir('.', { withFileTypes: true })) { if (EXCLUDE.has(e.name)) continue; await cp(e.name, path.join(OUT, e.name), { recursive: true }); }
await mkdir(path.join(OUT, SONG_DIR), { recursive: true });
console.log(`song folder: ${SONG_DIR}/ (${files.length} files)`);
const songs = [], issues = [], byId = new Map(), byNo = new Map();
const warn = (file, msg) => { issues.push({ file, msg }); console.log(`::warning file=${SONG_DIR}/${file}::${msg}`); };
for (const file of files) {
  const u8 = new Uint8Array(await readFile(path.join(SONG_DIR, file)));
  let lite; try { lite = await readLite(u8); } catch (e) { warn(file, '読み込めません: ' + e.message + '（暗号キーが違う可能性）'); continue; }
  const e = { file, sha: gitSha(u8), size: u8.length }; for (const k of LITE) if (lite[k] !== undefined) e[k] = lite[k];
  if (!e.title || !String(e.title).trim()) warn(file, 'タイトルが空です');
  if (!e.composer || !String(e.composer).trim()) warn(file, '作曲者が空です');
  if (file !== `${e.id}.oct8`) warn(file, `ファイル名がID（${e.id}）と一致しません`);
  if (byId.has(e.id)) { warn(file, `ID「${e.id}」が ${byId.get(e.id)} と重複しています（後のファイルは無視されます）`); continue; }
  if (e.no != null && byNo.has(e.no)) warn(file, `番号 ${e.no} が ${byNo.get(e.no)} と重複しています`);
  byId.set(e.id, file); if (e.no != null) byNo.set(e.no, file); songs.push(e);
}
songs.sort((a, b) => (a.no ?? 1e9) - (b.no ?? 1e9) || String(a.id).localeCompare(String(b.id)));
await writeFile(path.join(OUT, 'catalog.oct8c'), await buildCatalog(songs));
await writeFile(path.join(OUT, 'index.json'), JSON.stringify({ format: 'oct8-index', updated: new Date().toISOString(), count: songs.length, folder: SONG_DIR, files: songs.map(s => ({ file: s.file, id: s.id, sha: s.sha, size: s.size })), issues }, null, 1));
if (!(await stat(path.join(OUT, 'index.html')).catch(() => null)) && await stat(APP_HTML).catch(() => null)) await copyFile(APP_HTML, path.join(OUT, 'index.html'));
await writeFile(path.join(OUT, '.nojekyll'), '');
console.log(`catalog: ${songs.length} songs, ${issues.length} issue(s)`);
