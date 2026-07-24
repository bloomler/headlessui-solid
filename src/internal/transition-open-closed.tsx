import {
  type Accessor,
  createContext,
  type Element,
  useContext,
} from "solid-js";

export enum OpenClosedState {
  Open = 1 << 0,
  Closed = 1 << 1,
  Closing = 1 << 2,
  Opening = 1 << 3,
}

type MaybeAccessor<T> = T | Accessor<T>;

const OpenClosedContext = createContext<Accessor<OpenClosedState> | null>(null);

function read<T>(value: MaybeAccessor<T>): T {
  return typeof value === "function" ? (value as Accessor<T>)() : value;
}

export function useOpenClosed(): Accessor<OpenClosedState> | null {
  return useContext(OpenClosedContext);
}

export function OpenClosedProvider(props: {
  children?: Element;
  value: MaybeAccessor<OpenClosedState>;
}): Element {
  return (
    <OpenClosedContext value={() => read(props.value)}>
      {props.children}
    </OpenClosedContext>
  );
}

export function ResetOpenClosedProvider(
  props: { children?: Element },
): Element {
  return <OpenClosedContext value={null}>{props.children}</OpenClosedContext>;
}
