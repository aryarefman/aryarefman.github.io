import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projects = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'projects.json'), 'utf8'));
const envId = (id) => id.toUpperCase().replace(/[^A-Z0-9]/g, '_');
const b64 = (b) => b.toString('base64');
const iter = 600000;

// Every project is published ENCRYPTED only (AES-256-GCM, key = PBKDF2-SHA256(password, random salt)).
// Passwords come from env (NOTES_PASSWORD_<ID> or NOTES_PASSWORD), never from a file. Plaintext never touches the repo.
function sourceDirFor(id) {
  const e = process.env[`NOTES_SOURCE_DIR_${envId(id)}`];
  if (e) return e;
  if (id === 'gdgoc-itb') return process.env.NOTES_SOURCE_DIR || path.join(os.homedir(), 'GDGOC-ITB', '.claude', 'agent-office');
  return null; // no source configured: published as an empty locked collection
}

const gcm = (key, data) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(data), c.final(), c.getAuthTag()]); // WebCrypto wants the tag appended
  return { iv, ct };
};

let failed = 0;
for (const p of projects) {
  const password = process.env[`NOTES_PASSWORD_${envId(p.id)}`] || process.env.NOTES_PASSWORD;
  if (!password) {
    console.warn(`! SKIPPED ${p.id}: set NOTES_PASSWORD_${envId(p.id)} (or NOTES_PASSWORD). Nothing written.`);
    failed++;
    continue;
  }
  const src = sourceDirFor(p.id);
  let raw = '[]';
  if (src) {
    const f = path.join(src, 'notes.json');
    if (fs.existsSync(f)) raw = fs.readFileSync(f, 'utf8');
    else { console.warn(`! SKIPPED ${p.id}: source notes not found at ${f}`); failed++; continue; }
  }

  // images referenced by the notes: /api/notes/images/<name> -> images/<name> (resolved to .enc in the browser)
  const names = [...new Set([...raw.matchAll(/\/api\/notes\/images\/([A-Za-z0-9._-]+)/g)].map((m) => m[1]))];
  const plain = raw.replaceAll('/api/notes/images/', 'images/');

  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(password, salt, iter, 32, 'sha256');
  const { iv, ct } = gcm(key, Buffer.from(plain, 'utf8'));
  const dataFile = p.dataFile || `data/${p.id}.json`;
  fs.mkdirSync(path.join(__dirname, path.dirname(dataFile)), { recursive: true });
  fs.writeFileSync(path.join(__dirname, dataFile), JSON.stringify({ v: 1, kdf: 'PBKDF2-SHA256', iter, salt: b64(salt), iv: b64(iv), ct: b64(ct) }), 'utf8');

  // encrypted images only: images/<id>/<name>.enc = iv(12) || ciphertext || tag. Originals are never copied.
  const outDir = path.join(__dirname, 'images', p.id);
  fs.rmSync(outDir, { recursive: true, force: true });
  let n = 0;
  for (const name of names) {
    const f = src && path.join(src, 'notes-img', name);
    if (!f || !fs.existsSync(f)) { console.warn(`  ! image missing for ${p.id}: ${name}`); continue; }
    const e = gcm(key, fs.readFileSync(f));
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, name + '.enc'), Buffer.concat([e.iv, e.ct]));
    n++;
  }
  console.log(`+ ${p.id}: encrypted ${dataFile} + ${n}/${names.length} images`);
}
if (failed) { console.error(`${failed} project(s) skipped. Fix the warnings above and re-run.`); process.exit(1); }
console.log('Done. Review with git status, then commit and push.');
