import type { Component, Element } from "solid-js";
import { renderToString } from "@solidjs/web";
import {
  OpenClosedProvider,
  OpenClosedState,
} from "../../src/internal/transition-open-closed.tsx";
import {
  Transition,
  TransitionChild,
  TransitionRoot,
} from "../../src/components/transition/transition.tsx";

const Transparent: Component<{ children?: Element }> = (props) => (
  <>{props.children}</>
);

export function renderVisibleTransition(): string {
  return renderToString(() => (
    <Transition
      show
      class="base"
      enter="enter"
      enterFrom="enter-from"
      enterTo="enter-to"
      entered="entered"
      leave="leave"
      leaveFrom="leave-from"
      leaveTo="leave-to"
    >
      <span>Visible</span>
    </Transition>
  ));
}

export function renderAppearingTransition(): string {
  return renderToString(() => (
    <Transition
      show
      appear
      as="section"
      class="base"
      enter="enter"
      enterFrom="enter-from"
      enterTo="enter-to"
    >
      Appearing
    </Transition>
  ));
}

export function renderUnmountedTransition(): string {
  return renderToString(() => <Transition show={false}>Hidden</Transition>);
}

export function renderRetainedTransition(): string {
  return renderToString(() => (
    <Transition show={false} unmount={false} as="aside">
      Retained
    </Transition>
  ));
}

export function renderNestedStatics(): string {
  return renderToString(() => (
    <Transition.Root show transition={false} as="main" id="root-transition">
      <Transition.Child as="section" id="first-child">
        First
      </Transition.Child>
      <TransitionChild as="article" id="second-child">
        Second
      </TransitionChild>
    </Transition.Root>
  ));
}

export function renderInheritedOpenClosed(): string {
  return renderToString(() => (
    <OpenClosedProvider value={OpenClosedState.Open}>
      <TransitionRoot as="nav">Inherited</TransitionRoot>
    </OpenClosedProvider>
  ));
}

export function renderAutoRootChild(): string {
  return renderToString(() => (
    <OpenClosedProvider value={OpenClosedState.Open}>
      <TransitionChild as="aside">Automatic root</TransitionChild>
    </OpenClosedProvider>
  ));
}

export function renderTransparentBoundary(): string {
  return renderToString(() => (
    <Transition show transition={false} as={Transparent}>
      <span id="transparent-child">Boundary child</span>
    </Transition>
  ));
}

export function renderMissingShow(): string {
  return renderToString(() => <Transition>Missing</Transition>);
}

export function renderOrphanChild(): string {
  return renderToString(() => <TransitionChild>Orphan</TransitionChild>);
}
