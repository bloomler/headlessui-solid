import { renderToString } from "@solidjs/web";
import {
  Dialog,
  DialogBackdrop,
  DialogDescription,
  DialogPanel,
  DialogTitle,
} from "../../src/components/dialog/dialog.tsx";
import { Transition } from "../../src/components/transition/transition.tsx";

export function renderOpenDialog(): string {
  return renderToString(() => (
    <main>
      <button type="button">Open</button>
      <Dialog open onClose={() => {}}>
        <DialogBackdrop />
        <DialogPanel>
          <DialogTitle>SSR title</DialogTitle>
          <DialogDescription>SSR description</DialogDescription>
          <button type="button">Action</button>
        </DialogPanel>
      </Dialog>
    </main>
  ));
}

export function renderClosedPersistentDialog(): string {
  return renderToString(() => (
    <Dialog autofocus={false} open={false} onClose={() => {}} unmount={false}>
      Persistent dialog
    </Dialog>
  ));
}

export function renderInheritedDialog(): string {
  return renderToString(() => (
    <Transition as="section" show transition={false}>
      <Dialog onClose={() => {}}>Inherited dialog</Dialog>
    </Transition>
  ));
}

export function renderSuppressedDialogStrategies(): {
  html: string;
  projectionCalls: number;
} {
  let projectionCalls = 0;
  const project = (label: string) => (_slot: { open: boolean }) => {
    projectionCalls += 1;
    return <span>{label}</span>;
  };

  const html = renderToString(() => (
    <main id="dialog-strategy-shell">
      <span id="before-dialogs">Before dialogs</span>
      <Dialog open static onClose={() => {}}>
        {project("Open static projection")}
      </Dialog>
      <Dialog open transition onClose={() => {}}>
        {project("Open transition projection")}
      </Dialog>
      <Dialog open={false} unmount={false} onClose={() => {}}>
        {project("Retained projection")}
      </Dialog>
      <span id="after-dialogs">After dialogs</span>
    </main>
  ));

  return { html, projectionCalls };
}

export function renderMissingProps(): string {
  return renderToString(() => (
    // @ts-expect-error runtime safeguard
    <Dialog autofocus={false} />
  ));
}

export function renderMissingOpen(): string {
  return renderToString(() => <Dialog autofocus={false} onClose={() => {}} />);
}

export function renderMissingClose(): string {
  return renderToString(() => (
    // @ts-expect-error runtime safeguard
    <Dialog autofocus={false} open={false} />
  ));
}

export function renderInvalidOpen(): string {
  return renderToString(() => (
    // @ts-expect-error runtime safeguard
    <Dialog autofocus={false} open={null} onClose={() => {}} />
  ));
}

export function renderInvalidClose(): string {
  return renderToString(() => (
    // @ts-expect-error runtime safeguard
    <Dialog autofocus={false} open={false} onClose={null} />
  ));
}

export function renderOrphanPanel(): string {
  return renderToString(() => <DialogPanel>Panel</DialogPanel>);
}

export function renderOrphanBackdrop(): string {
  return renderToString(() => <DialogBackdrop>Backdrop</DialogBackdrop>);
}

export function renderOrphanTitle(): string {
  return renderToString(() => <DialogTitle>Title</DialogTitle>);
}
