import { defineConfig } from 'vitest/config';
import angular from '@analogjs/vite-plugin-angular';
import { playwright } from '@vitest/browser-playwright';
import { preview } from '@vitest/browser-preview';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const useManualBrowser = process.env['VITEST_BROWSER_MANUAL'] === '1';

export default defineConfig({
  plugins: [angular({ tsconfig: 'tsconfig.vitest.json' })],
  resolve: {
    alias: {
      'src/': path.resolve(__dirname, 'src') + '/',
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        silenceDeprecations: [
          'import',
          'global-builtin',
          'color-functions',
          'if-function',
        ],
      },
    },
  },
  optimizeDeps: {
    // Pre-bundle all Angular/Material/CDK packages so Vite doesn't discover
    // them mid-test and trigger a page reload that kills in-progress tests.
    include: [
      '@angular/core',
      '@angular/core/testing',
      '@angular/common',
      '@angular/common/http',
      '@angular/forms',
      '@angular/router',
      '@angular/router/testing',
      '@angular/platform-browser',
      '@angular/platform-browser/animations',
      '@angular/platform-browser-dynamic/testing',
      '@angular/material/bottom-sheet',
      '@angular/material/button',
      '@angular/material/core',
      '@angular/material/dialog',
      '@angular/material/divider',
      '@angular/material/form-field',
      '@angular/material/icon',
      '@angular/material/icon/testing',
      '@angular/material/input',
      '@angular/material/list',
      '@angular/material/menu',
      '@angular/material/progress-spinner',
      '@angular/material/slide-toggle',
      '@angular/material/snack-bar',
      '@angular/material/tooltip',
      '@analogjs/vitest-angular/setup-zone',
      '@cmusei/crucible-common',
      '@datorama/akita',
      '@datorama/akita-ng-router-store',
      '@microsoft/signalr',
      '@testing-library/angular',
      '@testing-library/jest-dom/vitest',
      '@testing-library/user-event',
      'rxjs',
      'rxjs/operators',
      'tslib',
    ],
  },
  server: {
    host: '0.0.0.0',
    port: 51302,
  },
  test: {
    globals: true,
    include: ['src/app/**/*.vitest.ts'],
    setupFiles: ['src/test-setup.vitest.browser.ts'],
    reporters: ['default'],
    isolate: true,
    api: {
      host: '0.0.0.0',
      port: 51303,
    },
    browser: {
      enabled: true,
      ...(useManualBrowser
        ? {
            // Manual mode: open the URL printed in the terminal in your
            // own browser to see components render and run tests live.
            provider: preview(),
            instances: [{ browser: 'preview' }],
          }
        : {
            // Automated mode: Playwright launches headless Chromium.
            provider: playwright({
              launch: { args: ['--no-sandbox'] },
            }),
            headless: true,
            instances: [{ browser: 'chromium' }],
          }),
      api: {
        host: '0.0.0.0',
        port: 63316,
      },
    },
  },
});
