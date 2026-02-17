// Copyright 2025 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { Injectable } from '@angular/core';
import {
  themeFromSourceColor,
  argbFromHex,
  hexFromArgb,
  Scheme,
} from '@material/material-color-utilities';

@Injectable({
  providedIn: 'root',
})
export class DynamicThemeService {
  /**
   * Generates Material 3 theme from a hex color
   * @param hexColor Source color in hex format (e.g., "#BB0000")
   * @returns Object containing light and dark theme schemes
   */
  generateThemeFromHex(hexColor: string): {
    light: Scheme;
    dark: Scheme;
  } {
    const argb = argbFromHex(hexColor);
    const theme = themeFromSourceColor(argb);
    return {
      light: theme.schemes.light,
      dark: theme.schemes.dark,
    };
  }

  /**
   * Applies theme colors to the document
   * @param hexColor Source color in hex format
   */
  applyThemeToDocument(hexColor: string): void {
    const { light, dark } = this.generateThemeFromHex(hexColor);
    this.injectLightTheme(light);
    this.injectDarkTheme(dark);
  }

  /**
   * Applies light theme colors to document root
   * @param hexColor Source color in hex format
   */
  applyLightTheme(hexColor: string): void {
    const { light } = this.generateThemeFromHex(hexColor);
    this.injectLightTheme(light);
  }

  /**
   * Applies dark theme colors to body.darkMode
   * @param hexColor Source color in hex format
   */
  applyDarkTheme(hexColor: string): void {
    const { dark } = this.generateThemeFromHex(hexColor);
    this.injectDarkTheme(dark);
  }

  /**
   * Injects light theme CSS variables into :root
   * @param scheme Material 3 light scheme
   */
  private injectLightTheme(scheme: Scheme): void {
    const variables = this.buildCssVariables(scheme);
    Object.entries(variables).forEach(([prop, value]) => {
      document.documentElement.style.setProperty(prop, value);
    });
  }

  /**
   * Injects dark theme CSS variables into body.darkMode
   * @param scheme Material 3 dark scheme
   */
  private injectDarkTheme(scheme: Scheme): void {
    const variables = this.buildCssVariables(scheme);

    // Create a style element for dark mode if it doesn't exist
    let styleElement = document.getElementById('dynamic-dark-theme');
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'dynamic-dark-theme';
      document.head.appendChild(styleElement);
    }

    // Build CSS rule for body.darkMode
    const cssRules = Object.entries(variables)
      .map(([prop, value]) => `  ${prop}: ${value};`)
      .join('\n');

    styleElement.textContent = `body.darkMode {\n${cssRules}\n}`;
  }

  /**
   * Builds CSS variable object from Material 3 scheme
   * @param scheme Material 3 color scheme
   * @returns Object mapping CSS variable names to hex colors
   */
  private buildCssVariables(scheme: Scheme): Record<string, string> {
    return {
      // Primary
      '--mat-sys-primary': hexFromArgb(scheme.primary),
      '--mat-sys-on-primary': hexFromArgb(scheme.onPrimary),
      '--mat-sys-primary-container': hexFromArgb(scheme.primaryContainer),
      '--mat-sys-on-primary-container': hexFromArgb(scheme.onPrimaryContainer),

      // Secondary
      '--mat-sys-secondary': hexFromArgb(scheme.secondary),
      '--mat-sys-on-secondary': hexFromArgb(scheme.onSecondary),
      '--mat-sys-secondary-container': hexFromArgb(scheme.secondaryContainer),
      '--mat-sys-on-secondary-container': hexFromArgb(
        scheme.onSecondaryContainer
      ),

      // Tertiary
      '--mat-sys-tertiary': hexFromArgb(scheme.tertiary),
      '--mat-sys-on-tertiary': hexFromArgb(scheme.onTertiary),
      '--mat-sys-tertiary-container': hexFromArgb(scheme.tertiaryContainer),
      '--mat-sys-on-tertiary-container': hexFromArgb(
        scheme.onTertiaryContainer
      ),

      // Error
      '--mat-sys-error': hexFromArgb(scheme.error),
      '--mat-sys-on-error': hexFromArgb(scheme.onError),
      '--mat-sys-error-container': hexFromArgb(scheme.errorContainer),
      '--mat-sys-on-error-container': hexFromArgb(scheme.onErrorContainer),

      // Background
      '--mat-sys-background': hexFromArgb(scheme.background),
      '--mat-sys-on-background': hexFromArgb(scheme.onBackground),

      // Surface
      '--mat-sys-surface': hexFromArgb(scheme.surface),
      '--mat-sys-on-surface': hexFromArgb(scheme.onSurface),
      '--mat-sys-surface-variant': hexFromArgb(scheme.surfaceVariant),
      '--mat-sys-on-surface-variant': hexFromArgb(scheme.onSurfaceVariant),

      // Inverse
      '--mat-sys-inverse-surface': hexFromArgb(scheme.inverseSurface),
      '--mat-sys-inverse-on-surface': hexFromArgb(scheme.inverseOnSurface),
      '--mat-sys-inverse-primary': hexFromArgb(scheme.inversePrimary),

      // Outline
      '--mat-sys-outline': hexFromArgb(scheme.outline),
      '--mat-sys-outline-variant': hexFromArgb(scheme.outlineVariant),

      // Shadow and Scrim
      '--mat-sys-shadow': hexFromArgb(scheme.shadow),
      '--mat-sys-scrim': hexFromArgb(scheme.scrim),
    };
  }
}
