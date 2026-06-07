'use strict';

const express = require('express');
const sharp = require('sharp');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();

const PORT = process.env.PORT || 3000;
const SERVER_BASE_URL = (process.env.SERVER_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Store uploads in memory, convert to JPEG via sharp when saving.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(Object.assign(new Error('Only image files are accepted'), { status: 400 }));
    }
    cb(null, true);
  },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function listImages() {
  return fs
    .readdirSync(UPLOADS_DIR)
    .filter((f) => f.endsWith('.jpg'))
    .map((f) => {
      const id = f.slice(0, -4);
      return {
        id,
        filename: f,
        templateUrl: `${SERVER_BASE_URL}/image/${id}?first_name={{contact.first_name}}`,
        previewUrl: `${SERVER_BASE_URL}/image/${id}?first_name=Preview`,
      };
    });
}

function svgOverlay(width, height, name) {
  const safe = name
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const fontSize = Math.max(48, Math.round(width * 0.065));
  const y = Math.round(height - fontSize * 1.1);
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sh">
          <feDropShadow dx="2" dy="2" stdDeviation="4" flood-color="#000" flood-opacity="0.8"/>
        </filter>
      </defs>
      <text
        x="${Math.round(width / 2)}" y="${y}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}" font-weight="bold"
        fill="#FFFFFF" text-anchor="middle"
        filter="url(#sh)"
      >${safe}</text>
    </svg>`);
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET / — browser upload UI
app.get('/', (req, res) => {
  const images = listImages();
  const uploaded = req.query.uploaded;

  const cards = images
    .map(({ id, templateUrl, previewUrl }) => {
      const highlight = id === uploaded ? 'background:#fffbe6;border-color:#f0c000;' : '';
      return `
        <div style="border:1px solid #ddd;border-radius:8px;padding:16px;margin:0 0 16px;${highlight}">
          <img src="/uploads/${id}.jpg"
               style="max-width:100%;border-radius:4px;display:block;margin-bottom:12px;" />
          <p style="margin:0 0 4px;font-size:13px;font-weight:bold;">GoHighLevel template URL</p>
          <div style="display:flex;gap:8px;align-items:center;">
            <input readonly value="${templateUrl}"
              style="flex:1;font-size:12px;padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-family:monospace;"
              onclick="this.select()" />
            <button onclick="navigator.clipboard.writeText('${templateUrl}')"
              style="padding:6px 12px;cursor:pointer;">Copy</button>
          </div>
          <a href="${previewUrl}" target="_blank"
             style="font-size:12px;color:#0070f3;display:inline-block;margin-top:8px;">
            Preview with "Preview" →
          </a>
        </div>`;
    })
    .join('');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Crew Image Generator</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; max-width: 680px;
           margin: 40px auto; padding: 0 20px; color: #222; }
    h1 { margin-bottom: 4px; }
    .hint { color: #666; font-size: 14px; margin-bottom: 24px; }
    .upload-box { border: 2px dashed #ccc; border-radius: 8px; padding: 24px;
                  text-align: center; margin-bottom: 32px; }
    .upload-box input[type=file] { display: block; margin: 0 auto 12px; }
    .upload-box button { padding: 10px 24px; font-size: 15px; cursor: pointer;
                         background: #0070f3; color: #fff; border: none; border-radius: 6px; }
  </style>
</head>
<body>
  <h1>Crew Image Generator</h1>
  <p class="hint">
    Upload a base image. Paste the <strong>GoHighLevel template URL</strong> into any GHL
    email or SMS — GHL replaces <code>{{contact.first_name}}</code> with each contact's
    name automatically.
  </p>

  <div class="upload-box">
    <form action="/upload" method="post" enctype="multipart/form-data">
      <input type="file" name="image" accept="image/*" required />
      <button type="submit">Upload image</button>
    </form>
  </div>

  <h2>Uploaded images</h2>
  ${cards || '<p style="color:#888;">No images yet — upload one above.</p>'}
</body>
</html>`);
});

// POST /upload — store image, return template URL
app.post('/upload', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }

  const id = uuidv4();
  const destPath = path.join(UPLOADS_DIR, `${id}.jpg`);

  try {
    await sharp(req.file.buffer).jpeg({ quality: 90 }).toFile(destPath);
  } catch (err) {
    console.error('[upload] sharp error:', err.message);
    return res.status(500).json({ error: 'Failed to process image', details: err.message });
  }

  const result = {
    id,
    templateUrl: `${SERVER_BASE_URL}/image/${id}?first_name={{contact.first_name}}`,
    previewUrl: `${SERVER_BASE_URL}/image/${id}?first_name=Preview`,
  };

  // Browser form → redirect back to home, highlight new image
  if (req.accepts('html')) {
    return res.redirect(`/?uploaded=${id}`);
  }
  return res.status(201).json(result);
});

// Serve raw (un-personalised) uploaded files
app.use('/uploads', express.static(UPLOADS_DIR));

// GET /image/:id?first_name=Jane — return personalised image
app.get('/image/:id', async (req, res) => {
  const { id } = req.params;
  const { first_name } = req.query;

  if (!first_name) {
    return res.status(400).json({ error: 'first_name query parameter is required' });
  }

  // Prevent path traversal
  if (!/^[\w-]{1,64}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid image id' });
  }

  const imagePath = path.join(UPLOADS_DIR, `${id}.jpg`);
  if (!fs.existsSync(imagePath)) {
    return res.status(404).json({ error: 'Image not found' });
  }

  try {
    const img = sharp(imagePath);
    const { width, height } = await img.metadata();
    const output = await sharp(imagePath)
      .composite([{ input: svgOverlay(width, height, first_name), top: 0, left: 0 }])
      .jpeg({ quality: 90 })
      .toBuffer();

    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=300');
    return res.send(output);
  } catch (err) {
    console.error('[/image/:id]', err.message);
    return res.status(500).json({ error: 'Image generation failed', details: err.message });
  }
});

// GET /images — JSON list of all uploaded images
app.get('/images', (_req, res) => res.json({ images: listImages() }));

// Health
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`  UI       : ${SERVER_BASE_URL}/`);
  console.log(`  Upload   : POST ${SERVER_BASE_URL}/upload`);
  console.log(`  Image    : GET  ${SERVER_BASE_URL}/image/:id?first_name={{contact.first_name}}`);
});

module.exports = app;
