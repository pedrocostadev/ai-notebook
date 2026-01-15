import sharp from 'sharp'
import { readFileSync, mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

const svgPath = join(rootDir, 'icon-options/option-2-chat-doc.svg')
const resourcesDir = join(rootDir, 'resources')

// Sizes needed for electron icons
const sizes = [16, 32, 48, 64, 128, 256, 512, 1024]

async function generateIcons() {
  mkdirSync(resourcesDir, { recursive: true })

  const svgBuffer = readFileSync(svgPath)

  // Generate PNGs at various sizes
  for (const size of sizes) {
    const outputPath = join(resourcesDir, `icon_${size}x${size}.png`)
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath)
    console.log(`Generated: ${outputPath}`)
  }

  // Generate main icon.png at 512x512
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(join(resourcesDir, 'icon.png'))
  console.log('Generated: icon.png')

  // Copy SVG as well
  writeFileSync(join(resourcesDir, 'icon.svg'), svgBuffer)
  console.log('Copied: icon.svg')

  console.log('\nDone! Now run: npx electron-icon-builder --input=resources/icon.png --output=resources')
}

generateIcons().catch(console.error)
