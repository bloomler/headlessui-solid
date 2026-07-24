import {
  type Accessor,
  createContext,
  type Element,
  useContext,
} from "solid-js";

type MaybeAccessor<T> = T | Accessor<T>;

const NO_PROVIDED_ID: Accessor<string | undefined> = () => undefined;
const IdContext = createContext<Accessor<string | undefined>>(NO_PROVIDED_ID);

function read<T>(value: MaybeAccessor<T>): T {
  return typeof value === "function" ? (value as Accessor<T>)() : value;
}

export function useProvidedId(): Accessor<string | undefined> {
  return useContext(IdContext);
}

export function IdProvider(props: {
  children?: Element;
  id: MaybeAccessor<string | undefined>;
}): Element {
  const id = () => read(props.id);
  return <IdContext value={id}>{props.children}</IdContext>;
}
