// Renders the app icons (run once: node tools/icons.mjs). A laurel-green tile with a serif "A".
import { chromium } from '@playwright/test';

const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#2F6149"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - 2 * pad) / 512})">
    <circle cx="256" cy="256" r="178" fill="none" stroke="#F6F8F2" stroke-width="14" opacity=".35"/>
    <text x="256" y="338" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="250" fill="#F6F8F2">A</text>
  </g></svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of [['icon-180', 180, 0], ['icon-192', 192, 0], ['icon-512', 512, 0], ['icon-512-maskable', 512, 60]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg(pad).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `icons/${name}.png`, omitBackground: false });
}
await browser.close();
