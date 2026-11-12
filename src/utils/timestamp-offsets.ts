import type { TimestampOffset } from './timescale-conversion';

/**
 * Stores `TimestampOffset` entries keyed by discontinuity sequence number
 * (fragment `cc`).
 *
 * The collection is backed by a `Map` rather than a sparse array so that large
 * discontinuity sequence numbers (which can reach two million and beyond) do
 * not allocate millions of empty slots. Pruning finished discontinuities,
 * adding entries and handing the table to the other tracks all stay constant
 * or linear in the number of stored entries instead of the sequence number.
 */
export class TimestampOffsets {
  private readonly offsets: Map<number, TimestampOffset>;

  constructor(entries?: ReadonlyArray<readonly [number, TimestampOffset]>) {
    this.offsets = entries ? new Map(entries) : new Map();
  }

  /** Number of discontinuity entries currently held. */
  get size(): number {
    return this.offsets.size;
  }

  /**
   * Mirrors `Array.length` so callers that previously relied on the sparse
   * array representation can check whether the table holds any entry.
   */
  get length(): number {
    return this.offsets.size;
  }

  get(cc: number): TimestampOffset | undefined {
    return this.offsets.get(cc);
  }

  set(cc: number, offset: TimestampOffset): this {
    this.offsets.set(cc, offset);
    return this;
  }

  has(cc: number): boolean {
    return this.offsets.has(cc);
  }

  /**
   * Removes every entry whose discontinuity sequence number is below `cc`.
   * The entry at `cc` (and any later ones) is kept untouched.
   */
  removeBefore(cc: number): void {
    this.offsets.forEach((_offset, key) => {
      if (key < cc) {
        this.offsets.delete(key);
      }
    });
  }

  clear(): void {
    this.offsets.clear();
  }

  /**
   * Returns a shallow copy of the table. The contained `TimestampOffset`
   * objects are shared with the source, matching the previous
   * `Array.prototype.slice` behavior.
   */
  clone(): TimestampOffsets {
    return new TimestampOffsets(Array.from(this.offsets));
  }

  /** Entry list sorted by discontinuity sequence number. */
  entries(): Array<[number, TimestampOffset]> {
    return Array.from(this.offsets).sort((a, b) => a[0] - b[0]);
  }
}
