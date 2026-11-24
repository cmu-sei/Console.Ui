// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

/**
 * Tooltips for the console's Keyboard and Clipboard menus and its Copy, Paste and Ctrl-Alt-Del
 * toolbar buttons, shared by the vSphere and Proxmox options bars. Each says what the control does
 * and, where it is disabled, why.
 *
 * The menus' Clipboard items move text between clipboards only, with no fallback. The toolbar
 * buttons keep theirs: Copy shows the text to copy by hand when the browser won't take it, and
 * Paste types the text instead when the VM's clipboard is out of reach.
 */

export const CTRL_ALT_DEL_TOOLTIP = 'Sends Ctrl-Alt-Del to the VM.';

export const TEXT_TOOLTIP =
  'Opens a dialog for text to type into the VM as keystrokes. Works on any VM, with no clipboard setup.';

// What the toolbar buttons add to the menu items' behavior.
const COPY_FALLBACK =
  ' If your browser blocks writing to your clipboard, shows the text so you can copy it by hand.';
const PASTE_TYPES_FALLBACK =
  ' If your browser blocks reading your clipboard, opens the dialog to type text instead.';

// Proxmox. The VM's clipboard is reachable only with clipboard=vnc on its display and spice-vdagent
// running in the guest; the console can see the first in the VM's config but not the second.
const PROXMOX_CLIPBOARD_SETUP =
  "this VM's display has clipboard=vnc set and spice-vdagent is running in the guest";

export const PROXMOX_COPY_TOOLTIP =
  "Copies the text last copied inside the VM from the VM's clipboard to your clipboard.";
export const PROXMOX_COPY_DISABLED_TOOLTIP = `Disabled: copying from the VM's clipboard works only when ${PROXMOX_CLIPBOARD_SETUP}, and clipboard=vnc isn't set on this VM.`;
export const PROXMOX_TOOLBAR_COPY_TOOLTIP =
  PROXMOX_COPY_TOOLTIP + COPY_FALLBACK;

export const PROXMOX_PASTE_TOOLTIP =
  "Puts your clipboard's text on the VM's clipboard. Then press Ctrl+V in the VM to paste it.";
export const PROXMOX_PASTE_DISABLED_TOOLTIP = `Disabled: pasting to the VM's clipboard works only when ${PROXMOX_CLIPBOARD_SETUP}, and clipboard=vnc isn't set on this VM. Keyboard > Text types text into the VM instead.`;
export const PROXMOX_TOOLBAR_PASTE_TOOLTIP =
  "Puts your clipboard's text on the VM's clipboard. Then press Ctrl+V in the VM to paste it. If your browser blocks reading your clipboard, opens a dialog for text to type into the VM instead.";
// The toolbar's Paste * on a VM without clipboard=vnc.
export const PROXMOX_TOOLBAR_PASTE_TYPES_TOOLTIP = `Opens a dialog for text to type into the VM as keystrokes (the * marks this). Pasting to the VM's clipboard works only when ${PROXMOX_CLIPBOARD_SETUP}, and clipboard=vnc isn't set on this VM.`;

// vSphere. Copy goes through VMware Tools; the console has no way to put text on the VM's
// clipboard, so its toolbar Paste types the text instead.
export const VSPHERE_COPY_TOOLTIP =
  "Copies the VM's clipboard to your clipboard, through VMware Tools.";
export const VSPHERE_COPY_NO_TOOLS_TOOLTIP =
  "Disabled: copying from the VM's clipboard needs VMware Tools running in the VM, and VMware Tools isn't installed in it.";
export const VSPHERE_COPY_TOOLS_STOPPED_TOOLTIP =
  "Disabled: copying from the VM's clipboard needs VMware Tools running in the VM, and VMware Tools isn't running in it.";
export const VSPHERE_PASTE_DISABLED_TOOLTIP =
  "Disabled: the vSphere console can't put text on the VM's clipboard. Keyboard > Text, or the toolbar's Paste, types text into the VM instead.";
export const VSPHERE_TOOLBAR_COPY_TOOLTIP =
  VSPHERE_COPY_TOOLTIP + COPY_FALLBACK;
export const VSPHERE_TOOLBAR_PASTE_TOOLTIP =
  "Types your clipboard's text into the VM as keystrokes, pressing Enter after each line. It doesn't use the VM's clipboard." +
  PASTE_TYPES_FALLBACK;
// The vSphere toolbar Copy stays enabled; its tooltip says when VMware Tools can't answer it.
export const VSPHERE_TOOLBAR_COPY_NO_TOOLS_NOTE =
  " VMware Tools isn't installed in this VM, so the copy won't work.";
export const VSPHERE_TOOLBAR_COPY_TOOLS_STOPPED_NOTE =
  " VMware Tools isn't running in this VM, so the copy won't work.";

// Messages for the menus' Clipboard items, which report a failure rather than fall back.
export const COPY_WRITE_BLOCKED_MESSAGE =
  "Copy failed: your browser blocked writing to your clipboard. Allow clipboard access for this site, or use the toolbar's Copy, which shows the text to copy by hand.";
export const PASTE_READ_BLOCKED_MESSAGE =
  'Paste failed: your browser blocked reading your clipboard. Allow clipboard access for this site, or use Keyboard > Text to type the text.';
