# Headless UI Solid

An unofficial, community-maintained port of Headless UI 2 for SolidJS 2. It
provides unstyled, accessible UI primitives while keeping Solid's native
reactivity, DOM events, SSR and hydration model.

> This project is not affiliated with or endorsed by Tailwind Labs. Headless UI
> is a project of Tailwind Labs. This port preserves the upstream MIT license
> and attribution.

The repository includes an extensive automated test suite covering component
state machines, SSR, hydration, DOM behavior, real-browser behavior, package
exports and public type contracts.

## Motivation

I have Tailwind Plus and I like the Catalyst & Application UI design,
but also don't want to use React.

## Solid compatibility

This release was fully tested with SolidJS `2.0.0-beta.25`. Later
SolidJS 2 betas, release candidates and stable versions may also work and the
NPM peer range permits users to test them without an override. Those versions
are not yet verified or guaranteed to be compatible.

If a Solid release introduces a breaking change, please open a bug report with
the `@bloomler/headlessui-solid`, `solid-js` and `@solidjs/web` versions and a
minimal reproduction. The port will be updated when an incompatibility is
identified.

## Install

From NPM:

```sh
npm i @bloomler/headlessui-solid
```

Your application must provide matching SolidJS 2 `solid-js` and `@solidjs/web`
packages. Beta.25 is the currently verified baseline.

From JSR:

```sh
deno add jsr:@bloomler/headlessui-solid
```

For Deno JSX, use matching SolidJS 2 packages. While Solid 2 is prerelease, the
`next` channel tracks its coordinated runtime:

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@solidjs/web"
  },
  "imports": {
    "@solidjs/web": "npm:@solidjs/web@next",
    "solid-js": "npm:solid-js@next"
  }
}
```

## Usage

NPM:

```tsx
import { Button } from "@bloomler/headlessui-solid";
```

JSR:

```tsx
import { Button } from "jsr:@bloomler/headlessui-solid";
```

## Components

The public API includes Button, Checkbox, Combobox, Dialog, Disclosure, Field,
Fieldset, FocusTrap, Input, Label, Legend, Listbox, Menu, Popover, Portal,
RadioGroup, Select, Switch, Tabs, Textarea, and Transition families.

The NPM package publishes separate browser and server ESM builds through
conditional exports and includes their TypeScript source for inspection and
source-map resolution. Import from `@bloomler/headlessui-solid`; `src` and
`dist` remain internal implementation paths.

## Development

Install [Deno 2](https://deno.com/) and run:

```sh
deno task verify
```

The complete browser gate also requires Brave:

```sh
deno task verify:all
```

Useful commands:

```sh
deno task publish:jsr:check
```

## License and attribution

MIT. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
