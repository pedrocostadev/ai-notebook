import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerRpm } from '@electron-forge/maker-rpm'

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'AI Notebook',
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
    new MakerZIP({}, ['darwin']),
    new MakerDeb({}),
    new MakerRpm({})
  ],
  plugins: []
}

export default config
