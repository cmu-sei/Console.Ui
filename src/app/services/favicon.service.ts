// Copyright 2022 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable()
export class FaviconService {
  private svgContent: string | null = null;
  private isLoading = false;
  private pendingColor: string | null = null;

  constructor(private http: HttpClient) {
    this.loadSvgIcon();
  }

  private loadSvgIcon(): void {
    if (this.isLoading || this.svgContent) {
      return;
    }

    this.isLoading = true;
    this.http
      .get('assets/svg-icons/ic_crucible_player.svg', { responseType: 'text' })
      .subscribe({
        next: (svg) => {
          this.svgContent = svg.trim();
          this.isLoading = false;

          if (this.pendingColor) {
            this.updateFavicon(this.pendingColor);
            this.pendingColor = null;
          }
        },
        error: (err) => {
          this.isLoading = false;
          console.error('FaviconService: Failed to load SVG', err);
        }
      });
  }

  updateFavicon(hexColor: string): void {
    if (!this.svgContent) {
      this.pendingColor = hexColor;
      return;
    }

    const coloredSvg = this.svgContent.replace(
      '.cls-1{}',
      `.cls-1{fill:${hexColor};}`
    );

    const encodedSvg = encodeURIComponent(coloredSvg);
    const dataUri = `data:image/svg+xml,${encodedSvg}`;

    let faviconLink = document.querySelector<HTMLLinkElement>(
      "link[rel*='icon']"
    );
    if (!faviconLink) {
      faviconLink = document.createElement('link');
      faviconLink.rel = 'icon';
      document.head.appendChild(faviconLink);
    }
    faviconLink.href = dataUri;
  }
}
