/**
 * Copyright 2021 Carnegie Mellon University. All Rights Reserved.
 * Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.
 */

export interface User {
  id: string;
  name: string;
}

export function createUser(params: Partial<User>) {
  return {} as User;
}
