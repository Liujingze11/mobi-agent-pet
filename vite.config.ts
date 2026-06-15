import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import electronRenderer from 'vite-plugin-electron-renderer'
import path from 'node:path'
import fs from 'node:fs'

// Plugin: copy schema.sql to dist-electron after electron build
function copySchemaPlugin() {
  return {
    name: 'copy-schema',
    writeBundle(_opts: any, bundle: any) {
      const outDir = _opts.dir || path.dirname(Object.values(bundle)[0]?.fileName || __dirname)
      const src = path.resolve(__dirname, 'electron/db/schema.sql')
      const dest = path.resolve(outDir, 'schema.sql')
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest)
        console.log('  ✓ schema.sql copied to', path.relative(__dirname, dest))
      }
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          plugins: [copySchemaPlugin()],
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['better-sqlite3', 'electron']
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      }
    ]),
    electronRenderer()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@electron': path.resolve(__dirname, './electron')
    }
  },
  build: {
    rollupOptions: {
      input: {
        pulsecore: path.resolve(__dirname, 'src/pulsecore/index.html'),
        gui: path.resolve(__dirname, 'src/gui/index.html')
      }
    }
  }
})
