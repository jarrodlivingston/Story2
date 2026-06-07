'use strict';

// Creates a simple 1200×675 gradient JPEG at assets/crew.jpg for local testing.
// Run with: npm run create-placeholder

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const OUTPUT = path.join(__dirname, '..', 'assets', 'crew.jpg');
const WIDTH = 1200;
const HEIGHT = 675;

async function main() {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });

  // A simple dark-blue gradient background with centred placeholder text.
  const svg = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0d1b2a"/>
          <stop offset="100%" style="stop-color:#1b4f72"/>
        </linearGradient>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
      <text
        x="${WIDTH / 2}" y="${HEIGHT / 2 - 20}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="64"
        font-weight="bold"
        fill="#FFFFFF"
        text-anchor="middle"
      >CREW</text>
      <text
        x="${WIDTH / 2}" y="${HEIGHT / 2 + 50}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="28"
        fill="#aaaaaa"
        text-anchor="middle"
      >Replace this file with your real crew.jpg</text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .jpeg({ quality: 90 })
    .toFile(OUTPUT);

  console.log(`Placeholder image written to ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
