import {
  type Accessor,
  createContext,
  type Element,
  useContext,
} from "solid-js";

const ForcePortalRootContext = createContext<Accessor<boolean>>(() => false);

export function usePortalRoot(): Accessor<boolean> {
  return useContext(ForcePortalRootContext);
}

export interface ForcePortalRootProps {
  force: boolean;
  children?: Element;
}

export function ForcePortalRoot(props: ForcePortalRootProps): Element {
  const force = () => Boolean(props.force);

  return (
    <ForcePortalRootContext value={force}>
      {props.children}
    </ForcePortalRootContext>
  );
}
