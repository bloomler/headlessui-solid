import {
  type Accessor,
  createContext,
  type Element,
  useContext,
} from "solid-js";

type MaybeAccessor<T> = T | Accessor<T>;

const NO_DISABLED: Accessor<boolean | undefined> = () => undefined;
const DisabledContext = createContext<Accessor<boolean | undefined>>(
  NO_DISABLED,
);

function read<T>(value: MaybeAccessor<T>): T {
  return typeof value === "function" ? (value as Accessor<T>)() : value;
}

export function useDisabled(): Accessor<boolean | undefined> {
  return useContext(DisabledContext);
}

export function DisabledProvider(props: {
  children?: Element;
  value: MaybeAccessor<boolean | undefined>;
}): Element {
  const value = () => read(props.value);
  return (
    <DisabledContext value={value}>
      {props.children}
    </DisabledContext>
  );
}
