// Copyright 2026 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

// jsdom implements neither FileList nor DataTransfer, so an array-like stand-in
// is the only way to hand a component the FileList an <input type="file"> would.
export function fileList(...files: File[]): FileList {
  return {
    ...files,
    length: files.length,
    item: (index: number) => files[index] ?? null,
    [Symbol.iterator]: () => files.values(),
  } as unknown as FileList;
}
