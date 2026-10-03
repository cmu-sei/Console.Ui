// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

// `@datorama/akita` (and `@material/material-color-utilities`, when installed)
// ship bundler-only ESM: no `"type": "module"` and extensionless relative
// imports. Node cannot load them in the jsdom environment that
// `@angular/build:unit-test` runs in, and the builder hardcodes
// `externalPackages: true`, so those packages are handed to Node untouched.
// `server.deps.inline`, `ssr.noExternal` and `optimizeDeps.include` do not
// help on this path; the files on disk have to be patched. See `patches/`.
//
// The patches are applied here, at config load, rather than from a
// `postinstall` hook: the Dockerfiles copy `package.json` and run `npm ci`
// before copying the rest of the repo, so a `postinstall` that reads
// `patches/` would break the image build.
execFileSync('npx', ['patch-package'], { stdio: 'inherit' });

// `angular.json` owns the test configuration. The mock lifecycle options live
// here because the builder does not surface them.
export default defineConfig({
  test: {
    clearMocks: true,
    restoreMocks: true,
  },
});
