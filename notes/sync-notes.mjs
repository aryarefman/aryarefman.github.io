import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = process.env.NOTES_SOURCE_DIR || 'C:/Users/arya4/GDGOC-ITB/.claude/agent-office';
const notesSrcPath = path.join(sourceDir, 'notes.json');
const imgSrcDir = path.join(sourceDir, 'notes-img');

if (!fs.existsSync(notesSrcPath)) {
  console.error(`Source notes not found at: ${notesSrcPath}`);
  process.exit(1);
}

// 1. Transform notes.json
const raw = fs.readFileSync(notesSrcPath, 'utf8');
const transformed = raw.replaceAll('/api/notes/images/', 'images/');
const destNotes = path.join(__dirname, 'notes.json');
fs.writeFileSync(destNotes, transformed, 'utf8');
console.log(`✓ Updated notes.json (${transformed.length} bytes)`);

// 2. Copy images
const destImgDir = path.join(__dirname, 'images');
if (!fs.existsSync(destImgDir)) fs.mkdirSync(destImgDir, { recursive: true });

if (fs.existsSync(imgSrcDir)) {
  const images = fs.readdirSync(imgSrcDir);
  for (const img of images) {
    fs.copyFileSync(path.join(imgSrcDir, img), path.join(destImgDir, img));
  }
  console.log(`✓ Copied ${images.length} images to notes/images/`);
}

console.log('✓ Notes synced successfully! Run git commit & git push to publish.');
