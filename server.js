'use strict';

const express = require('express');
const sharp = require('sharp');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const GHL_API_KEY = process.env.GHL_API_KEY;
const GHL_CUSTOM_FIELD_ID = process.env.GHL_CUSTOM_FIELD_ID;
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || `http://localhost:${PORT}`;

const CREW_IMAGE_PATH = path.join(__dirname, 'assets', 'crew.jpg');

// ── Endpoint 1: Generate a crew image with a name overlay ──────────────────
// GET /generate-crew-image?first_name=Jane
// Returns the personalized JPEG image directly.
app.get('/generate-crew-image', async (req, res) => {
  const { first_name } = req.query;

  if (!first_name) {
    return res.status(400).json({ error: 'first_name query parameter is required' });
  }

  if (!fs.existsSync(CREW_IMAGE_PATH)) {
    return res.status(500).json({
      error: 'Base image not found. Place crew.jpg inside the assets/ directory.',
    });
  }

  try {
    const image = sharp(CREW_IMAGE_PATH);
    const { width, height } = await image.metadata();

    // Escape XML special characters so sharp's SVG renderer handles any name safely.
    const safeName = first_name
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    // Build an SVG overlay: name centred near the bottom with a drop-shadow.
    const fontSize = Math.max(48, Math.round(width * 0.07));
    const svgOverlay = Buffer.from(`
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="3" dy="3" stdDeviation="5" flood-color="#000000" flood-opacity="0.75"/>
          </filter>
        </defs>
        <text
          x="${Math.round(width / 2)}"
          y="${Math.round(height - fontSize)}"
          font-family="Arial, Helvetica, sans-serif"
          font-size="${fontSize}"
          font-weight="bold"
          fill="#FFFFFF"
          text-anchor="middle"
          filter="url(#shadow)"
        >${safeName}</text>
      </svg>
    `);

    const output = await sharp(CREW_IMAGE_PATH)
      .composite([{ input: svgOverlay, top: 0, left: 0 }])
      .jpeg({ quality: 90 })
      .toBuffer();

    res.set('Content-Type', 'image/jpeg');
    res.set('Content-Disposition', `inline; filename="crew-${first_name}.jpg"`);
    res.set('Cache-Control', 'no-store');
    return res.send(output);
  } catch (err) {
    console.error('[generate-crew-image]', err.message);
    return res.status(500).json({ error: 'Image generation failed', details: err.message });
  }
});

// ── Endpoint 2: Update a GoHighLevel contact's custom field ────────────────
// POST /update-ghl-contact
// Body (JSON): { "contact_id": "abc123", "first_name": "Jane" }
//   OR supply a ready-made image_url instead of first_name.
// Requires env vars: GHL_API_KEY, GHL_CUSTOM_FIELD_ID, SERVER_BASE_URL
app.post('/update-ghl-contact', async (req, res) => {
  const { contact_id, first_name, image_url } = req.body;

  if (!contact_id) {
    return res.status(400).json({ error: 'contact_id is required' });
  }

  if (!GHL_API_KEY) {
    return res.status(500).json({ error: 'GHL_API_KEY environment variable is not configured' });
  }

  if (!GHL_CUSTOM_FIELD_ID) {
    return res.status(500).json({ error: 'GHL_CUSTOM_FIELD_ID environment variable is not configured' });
  }

  // Resolve image URL: use provided URL or build one from SERVER_BASE_URL + first_name.
  let resolvedImageUrl = image_url;
  if (!resolvedImageUrl) {
    if (!first_name) {
      return res.status(400).json({ error: 'Provide either image_url or first_name' });
    }
    resolvedImageUrl = `${SERVER_BASE_URL}/generate-crew-image?first_name=${encodeURIComponent(first_name)}`;
  }

  try {
    const ghlRes = await axios.put(
      `https://services.leadconnectorhq.com/contacts/${contact_id}`,
      {
        customFields: [
          {
            id: GHL_CUSTOM_FIELD_ID,
            field_value: resolvedImageUrl,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${GHL_API_KEY}`,
          'Content-Type': 'application/json',
          Version: '2021-07-28',
        },
      }
    );

    return res.json({
      success: true,
      contact_id,
      image_url: resolvedImageUrl,
      ghl_contact: ghlRes.data,
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const details = err.response?.data || err.message;
    console.error('[update-ghl-contact] GHL API error:', details);
    return res.status(status).json({ error: 'Failed to update GoHighLevel contact', details });
  }
});

// ── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`  Image endpoint : GET  ${SERVER_BASE_URL}/generate-crew-image?first_name=<name>`);
  console.log(`  GHL endpoint   : POST ${SERVER_BASE_URL}/update-ghl-contact`);
});

module.exports = app;
