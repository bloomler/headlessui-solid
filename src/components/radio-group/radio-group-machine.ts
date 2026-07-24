/**
 * Comparator accepted by value-based selection components.
 */
export type ByComparator<T> =
  | (NonNullable<T> extends never ? string
    : keyof NonNullable<T> & string)
  | ((a: T, z: T) => boolean);

function propertyValue(value: unknown, property: string): unknown {
  if (value === null || value === undefined) return undefined;
  return (Object(value) as Record<string, unknown>)[property];
}

export function compareRadioValues<T>(
  by: ByComparator<T> | undefined,
  a: T,
  z: T,
): boolean {
  if (typeof by === "string") {
    return propertyValue(a, by) === propertyValue(z, by);
  }

  if (typeof by === "function") return by(a, z);

  if (
    a !== null &&
    z !== null &&
    typeof a === "object" &&
    typeof z === "object" &&
    "id" in a &&
    "id" in z
  ) {
    return a.id === z.id;
  }

  return a === z;
}

export function resolveRadioTabIndex(options: {
  checked: boolean;
  containsCheckedOption: boolean;
  disabled: boolean;
  isFirstOption: boolean;
  tabIndex: number;
}): number {
  if (options.disabled) return -1;
  if (options.checked) return options.tabIndex;
  if (!options.containsCheckedOption && options.isFirstOption) {
    return options.tabIndex;
  }
  return -1;
}

export function radioFormValue(value: unknown): unknown {
  return value ? value : "on";
}
