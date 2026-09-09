/** Rasterises public/icons/icon.svg into the PNG sizes the manifest declares. */
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const svg = readFileSync('public/icons/icon.svg')

/* Maskable icons are cropped to a circle by the launcher, so the artwork is
   inset onto a full-bleed brand background with the safe zone respected. */
const maskable = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0f3d2e"/>
  <g fill="none" stroke="#ffffff" stroke-width="22" stroke-linecap="round">
    <path d="M160 196h192M160 256h192M160 316h192"/>
  </g>
  <g fill="#c2701c">
    <circle cx="200" cy="196" r="22"/><circle cx="256" cy="256" r="22"/><circle cx="312" cy="316" r="22"/>
  </g>
</svg>`)

const jobs = [
  [svg, 192, 'public/icons/icon-192.png'],
  [svg, 512, 'public/icons/icon-512.png'],
  [maskable, 512, 'public/icons/icon-maskable-512.png'],
  [svg, 180, 'public/icons/apple-touch-icon.png'],
]

for (const [input, size, out] of jobs) {
  await sharp(input, { density: 384 }).resize(size, size).png().toFile(out)
  console.log(`wrote ${out}`)
}
