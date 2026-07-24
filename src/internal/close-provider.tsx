import {
  createContext,
  type Element,
  type ParentProps,
  useContext,
} from "solid-js";

export type CloseHandler = () => void;

const CloseContext = createContext<CloseHandler>(() => {});

/** Return the close command from the nearest dismissible component. */
export function useClose(): CloseHandler {
  return useContext(CloseContext);
}

export function CloseProvider(
  props: ParentProps<{ value: CloseHandler }>,
): Element {
  return <CloseContext value={props.value}>{props.children}</CloseContext>;
}
