type MatchHandler<TReturnValue> = (...args: never[]) => TReturnValue;

export function match<
  TValue extends string | number = string,
  TReturnValue = unknown,
>(
  value: TValue,
  lookup: Record<TValue, TReturnValue | MatchHandler<TReturnValue>>,
  ...args: unknown[]
): TReturnValue {
  if (value in lookup) {
    const returnValue = lookup[value];
    return typeof returnValue === "function"
      ? Reflect.apply(returnValue, undefined, args) as TReturnValue
      : returnValue as TReturnValue;
  }

  const error = new Error(
    `Tried to handle "${value}" but there is no handler defined. Only defined handlers are: ${
      Object.keys(lookup)
        .map((key) => `"${key}"`)
        .join(", ")
    }.`,
  );
  const errorConstructor = Error as ErrorConstructor & {
    captureStackTrace?: (
      error: Error,
      constructor: (...args: never[]) => unknown,
    ) => void;
  };
  errorConstructor.captureStackTrace?.(error, match);
  throw error;
}
