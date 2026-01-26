import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerRpm } from '@electron-forge/maker-rpm'

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '**/{better-sqlite3,sqlite-vec}/**'
    },
    name: 'AI Notebook',
    executableName: 'ai-notebook',
    extraResource: ['./resources/icons'],
    icon: './resources/icons/mac/icon',
    ignore: [
      /^\/src($|\/)/,
      /^\/e2e($|\/)/,
      /^\/resources($|\/)/,
      /^\/playwright/,
      /^\/dist($|\/)/,
      /^\/(tsconfig|forge\.config|electron\.vite|tailwind|postcss|components\.json|\.)/,
    ],
  },
  outDir: 'dist',
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerDMG({}),
    new MakerDeb({}),
    new MakerRpm({})
  ],
  plugins: []
}

export default config
