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

Headless UI has a mature component API and ecosystem. This port brings those
component families to SolidJS 2 while using Solid-native reactivity, rendering,
events, SSR and hydration.

The API shape is deliberately familiar to make existing component patterns
easier to migrate. Compatibility has been exercised against patterns used by
Catalyst and Tailwind Plus Application UI, those commercial templates are not
included or redistributed here.

## Solid compatibility

This release was developed and fully tested with SolidJS `2.0.0-beta.25`. Later
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
npm install @bloomler/headlessui-solid@0.1.0-beta.2
```

Your application must provide matching SolidJS 2 `solid-js` and `@solidjs/web`
packages. Beta.25 is the currently verified baseline.

From JSR:

```sh
deno add jsr:@bloomler/headlessui-solid@0.1.0-beta.2
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
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from "@bloomler/headlessui-solid";

export function AccountMenu() {
  return (
    <Menu>
      <MenuButton>Account</MenuButton>
      <MenuItems>
        <MenuItem as="a" href="/profile">
          Profile
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}
```

JSR:

```ts
import { Button } from "jsr:@bloomler/headlessui-solid@0.1.0-beta.2";
```

## Components

The public API includes Button, Checkbox, Combobox, Dialog, Disclosure, Field,
Fieldset, FocusTrap, Input, Label, Legend, Listbox, Menu, Popover, Portal,
RadioGroup, Select, Switch, Tabs, Textarea, and Transition families.

The NPM package publishes separate browser and server ESM builds through
conditional exports. Import from `@bloomler/headlessui-solid`; do not import
internal `src` or `dist` paths.

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

Based on Headless UI version 2.2.10 for React.

MIT. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
