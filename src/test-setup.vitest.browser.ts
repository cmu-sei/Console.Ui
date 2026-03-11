// Guard against double-import in browser mode shared context
if (!(globalThis as any)['__vitest_zone_patch__']) {
  await import('@analogjs/vitest-angular/setup-zone');
}

// Load Angular Material prebuilt theme for full component styling.
// The app's custom styles.scss uses Material 3 SCSS mixins that require
// Angular CLI's custom Sass importer. Vite's Sass processor doesn't have
// that importer, so we load the prebuilt theme instead for visual fidelity.
import '@angular/material/prebuilt-themes/azure-blue.css';

// Load Bootstrap CSS (same as angular.json styles config)
import 'bootstrap/dist/css/bootstrap.min.css';

import '@testing-library/jest-dom/vitest';

import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

// Initialize Angular test environment (only once in shared context)
if (!(globalThis as any)['__vitest_angular_testbed_init__']) {
  (globalThis as any)['__vitest_angular_testbed_init__'] = true;
  getTestBed().initTestEnvironment(
    BrowserDynamicTestingModule,
    platformBrowserDynamicTesting(),
    {
      teardown: { destroyAfterEach: false, rethrowErrors: false },
    }
  );
}

// In browser mode, test files share a global context. We must reset TestBed
// before each test to prevent "Cannot configure the test module when the test
// module has already been instantiated" errors.
beforeEach(() => {
  try {
    getTestBed().resetTestingModule();
  } catch (e) {
    // Suppress cleanup errors from child components with async subscriptions
  }

  // Clean up stale CDK overlay containers from previous Material dialog/menu tests
  document
    .querySelectorAll('.cdk-overlay-container')
    .forEach((el) => el.remove());

  // Match the production index.html body classes
  document.body.classList.add('mat-typography', 'mat-app-background');
});
