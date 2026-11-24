// SPDX-License-Identifier: MIT

export interface Transactor {
  run<T>(work: () => T): T;
}
