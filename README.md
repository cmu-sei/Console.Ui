# Player.Vm.Console.Ui Readme

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 1.6.1.

This project contains a prototype for a VMware VM console app utilizing Angular and WebMKS.

Settings are currently configured in `src/environments/`. Please update the URLs in those files to set the appropriate **host:port** for the **player.vm.api**.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4305/`. The app will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory. Use the `-prod` flag for a production build.

## Running unit tests

Unit tests run under Angular's `@angular/build:unit-test` builder with **Vitest** (jsdom, zone.js change
detection, like the app) and `@testing-library/angular`. The setup is the shared Crucible UI test setup that
every Crucible Angular UI uses.

```bash
npm test               # Run all tests once (ng test --watch=false)
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run once with v8 coverage and the thresholds in angular.json (what CI runs)
```

Shared test helpers live in [`src/app/test-utils/`](src/app/test-utils/): `renderComponent`, the default
providers (`default-test-providers.ts`), `permissionDataProviders` for permission gates, typed API stubs
(`ApiStub`), the SignalR fake (`mockHubConnectionBuilder`), and console.ui's own WebMKS and clipboard fakes.
`src/test-setup.ts` fails any test that logs `console.error`. `vitest.config.ts` applies `patches/` with
`patch-package` when it loads, because Akita and `@material/material-color-utilities` ship ESM that Node
cannot load unpatched.

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via [Protractor](http://www.protractortest.org/).

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI README](https://github.com/angular/angular-cli/blob/master/README.md).

#### Settings

All configurable values - URLs, etc. - should be made to use the **SettingsService**. The **SettingsService** loads its values from configuration files located in `/assets/config/`. There are two files used for this. They are as follows:

- **settings.json:** This file is committed to source control, and holds default values for all settings. Changes should only be made to this file to add new settings, or change the default value of a setting that will affect everyone who pulls down the project.
- **settings.env.json:** This file is _not_ committed to source control, and will differ for each environment. Settings can be placed into this file and they will override settings found in `settings.json`. Any settings not found in this file will default to the values in `settings.json`.

In a production environment, `settings.env.json` should contain only the settings that need to be changed for that environment, and `settings.json` serves as a reference for the default values as well as any unchanged settings. `settings.json` should not be altered in a production environment for any reason.

## Reporting bugs and requesting features

Think you found a bug? Please report all Crucible bugs - including bugs for the individual Crucible apps - in the [cmu-sei/crucible issue tracker](https://github.com/cmu-sei/crucible/issues).

Include as much detail as possible including steps to reproduce, specific app involved, and any error messages you may have received.

Have a good idea for a new feature? Submit all new feature requests through the [cmu-sei/crucible issue tracker](https://github.com/cmu-sei/crucible/issues).

Include the reasons why you're requesting the new feature and how it might benefit other Crucible users.

## License

Copyright 2021 Carnegie Mellon University. See the [LICENSE.md](./LICENSE.md) files for details.
