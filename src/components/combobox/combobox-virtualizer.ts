export interface ComboboxVirtualItem {
  readonly end: number;
  readonly index: number;
  readonly size: number;
  readonly start: number;
}

export interface ComboboxVirtualizerOptions {
  count?: number;
  estimateSize?: number;
  overscan?: number;
}

/**
 * Small framework-neutral virtualizer tailored to the Combobox contract.
 * Rows start with an estimate and replace it with measured geometry as soon as
 * they mount. The viewport adapter in `combobox.tsx` owns DOM observation.
 */
export class ComboboxVirtualizer {
  #count: number;
  #estimateSize: number;
  #measurements = new Map<number, number>();
  #overscan: number;
  #paddingEnd = 0;
  #paddingStart = 0;
  #scrollTop = 0;
  #viewportSize = 0;

  constructor(options: ComboboxVirtualizerOptions = {}) {
    this.#count = Math.max(0, options.count ?? 0);
    this.#estimateSize = Math.max(1, options.estimateSize ?? 40);
    this.#overscan = Math.max(0, options.overscan ?? 12);
  }

  configure(options: {
    count: number;
    paddingEnd?: number;
    paddingStart?: number;
    scrollTop?: number;
    viewportSize?: number;
  }): void {
    this.#count = Math.max(0, options.count);
    this.#paddingEnd = Math.max(0, options.paddingEnd ?? this.#paddingEnd);
    this.#paddingStart = Math.max(
      0,
      options.paddingStart ?? this.#paddingStart,
    );
    this.#scrollTop = Math.max(0, options.scrollTop ?? this.#scrollTop);
    this.#viewportSize = Math.max(
      0,
      options.viewportSize ?? this.#viewportSize,
    );
    for (const index of this.#measurements.keys()) {
      if (index >= this.#count) this.#measurements.delete(index);
    }
  }

  item(index: number): ComboboxVirtualItem | null {
    if (index < 0 || index >= this.#count) return null;
    let start = 0;
    for (let current = 0; current < index; current++) {
      start += this.size(current);
    }
    const size = this.size(index);
    return { end: start + size, index, size, start };
  }

  /** Stable primitive keys for Solid's keyed `<For>` reconciliation. */
  indices(activeIndex: number | null = null): number[] {
    return this.items(activeIndex).map((item) => item.index);
  }

  items(activeIndex: number | null = null): ComboboxVirtualItem[] {
    if (this.#count === 0) return [];

    const viewport = this.#viewportSize || this.#estimateSize * 8;
    const viewportStart = Math.max(0, this.#scrollTop - this.#paddingStart);
    const viewportEnd = viewportStart + viewport;
    let first = 0;
    let last = this.#count - 1;
    let cursor = 0;

    for (let index = 0; index < this.#count; index++) {
      const end = cursor + this.size(index);
      if (end > viewportStart) {
        first = index;
        break;
      }
      cursor = end;
    }

    cursor = 0;
    for (let index = 0; index < this.#count; index++) {
      const start = cursor;
      cursor += this.size(index);
      if (start < viewportEnd) last = index;
      else break;
    }

    first = Math.max(0, first - this.#overscan);
    last = Math.min(this.#count - 1, last + this.#overscan);
    const indices = new Set<number>();
    for (let index = first; index <= last; index++) indices.add(index);
    if (activeIndex !== null && activeIndex >= 0 && activeIndex < this.#count) {
      indices.add(activeIndex);
    }
    return [...indices].sort((a, z) => a - z).map((index) => this.item(index)!);
  }

  measure(index: number, size: number): boolean {
    if (
      index < 0 || index >= this.#count || !Number.isFinite(size) || size <= 0
    ) {
      return false;
    }
    if (this.#measurements.get(index) === size) return false;
    this.#measurements.set(index, size);
    return true;
  }

  resetMeasurements(): void {
    this.#measurements.clear();
  }

  scrollOffsetForIndex(index: number): number | null {
    const item = this.item(index);
    if (!item) return null;
    const viewport = this.#viewportSize || this.#estimateSize * 8;
    const visibleStart = Math.max(0, this.#scrollTop - this.#paddingStart);
    const visibleEnd = visibleStart + viewport;
    if (item.start < visibleStart) return this.#paddingStart + item.start;
    if (item.end > visibleEnd) {
      return Math.max(0, this.#paddingStart + item.end - viewport);
    }
    return null;
  }

  size(index: number): number {
    return this.#measurements.get(index) ?? this.#estimateSize;
  }

  totalSize(): number {
    let total = 0;
    for (let index = 0; index < this.#count; index++) {
      total += this.size(index);
    }
    return total;
  }

  get paddingEnd(): number {
    return this.#paddingEnd;
  }

  get paddingStart(): number {
    return this.#paddingStart;
  }
}
