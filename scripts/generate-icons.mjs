/**
 * Rasterises the GridSupply mark into every size the manifest declares.
 *
 * The mark is authored on a transparent ground (public/icons/logo-mark.svg) so
 * it can sit on glass in the app header. Launcher icons need an opaque tile, so
 * each variant is composed here rather than baked into the source art:
 *
 *   any       — rounded tile, mark at ~78% (icon grids already inset it)
 *   maskable  — full bleed, mark at ~60% to survive a circular crop
 *   apple     — square, no rounding; iOS applies its own mask
 */
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'

const mark = readFileSync('public/icons/logo-mark.svg', 'utf8')
  .replace(/<\?xml[^>]*\?>/, '')
  .replace(/<svg /, '<svg x="{{X}}" y="{{Y}}" width="{{W}}" height="{{W}}" ')

const GROUND = '#F4FAFF'

const compose = (size, scale, radius) => {
  const w = Math.round(size * scale)
  const off = Math.round((size - w) / 2)
  const inner = mark.replace('{{X}}', off).replace('{{Y}}', off).replaceAll('{{W}}', w)
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<rect width="${size}" height="${size}" rx="${radius}" fill="${GROUND}"/>` +
      inner +
      `</svg>`,
  )
}

const jobs = [
  ['public/icons/icon-192.png', compose(192, 0.78, 43)],
  ['public/icons/icon-512.png', compose(512, 0.78, 114)],
  ['public/icons/icon-maskable-512.png', compose(512, 0.6, 0)],
  ['public/icons/apple-touch-icon.png', compose(180, 0.8, 0)],
  ['public/icons/favicon-32.png', compose(32, 0.9, 6)],
]

for (const [out, svg] of jobs) {
  await sharp(svg, { density: 600 }).png().toFile(out)
  console.log(`wrote ${out}`)
}

/* The browser tab icon: same composition, kept as vector. */
writeFileSync(
  'public/icons/icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
    `<rect width="512" height="512" rx="114" fill="${GROUND}"/>` +
    mark.replace('{{X}}', 56).replace('{{Y}}', 56).replaceAll('{{W}}', 400) +
    `</svg>`,
)
console.log('wrote public/icons/icon.svg')
