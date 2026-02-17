// Copyright 2025 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { ComnSettingsService } from '@cmusei/crucible-common';
import { DynamicThemeService } from './dynamic-theme.service';

/**
 * Factory function for APP_INITIALIZER to apply theme colors at app startup
 * @param settingsService Service providing access to settings.json
 * @param themeService Service for generating and applying theme colors
 * @returns Promise-returning function for APP_INITIALIZER
 */
export function initializeTheme(
  settingsService: ComnSettingsService,
  themeService: DynamicThemeService
): () => Promise<void> {
  return (): Promise<void> => {
    return new Promise((resolve) => {
      // Get theme color from settings, fallback to default red
      const hexColor =
        settingsService.settings.AppPrimaryThemeColor || '#BB0000';

      // Apply theme to document
      themeService.applyThemeToDocument(hexColor);

      resolve();
    });
  };
}
