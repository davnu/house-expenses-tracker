import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { blogArticlesPlugin } from './vite-plugin-blog-articles'

export default defineConfig({
  plugins: [react(), tailwindcss(), blogArticlesPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    projects: [
      {
        // Vitest projects don't automatically inherit the root `plugins`
        // field, so the markdown transformer must be declared explicitly
        // here — otherwise blog.ts imports of `.md` files fail at runtime
        // with "invalid JS syntax" when tests load.
        plugins: [blogArticlesPlugin()],
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['./src/test-setup.ts'],
        },
        resolve: {
          alias: {
            '@': path.resolve(__dirname, './src'),
          },
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          globalSetup: './tests/integration/global-setup.ts',
          testTimeout: 30_000,
          fileParallelism: false,
        },
      },
    ],
  },
})
