# Contributing to AAM Helper

First off, thank you for considering contributing to `aam-helper`. It's people like you that make `aam-helper` such a great tool.

## Where do I go from here?

If you've noticed a bug or have a question, [search the issue tracker](https://github.com/ininids/aam-helper/issues) to see if someone else in the community has already created a ticket. If not, go ahead and [make one](https://github.com/ininids/aam-helper/issues/new/choose)!

## Making a Pull Request

- Fork the repository and create your branch from `main`.
- If you've added code that should be tested, add tests.
- Ensure the test suite passes (`pnpm test`).
- Make sure your code lints (`pnpm run lint`).
- Document any new features or updates in the `README.md`.

## Development Setup

We use `pnpm` for package management. To get started, you can run:

```bash
pnpm install
pnpm run compile
```

To run the extension in a new VS Code window during development, press `F5`.

## Code style

Please follow the coding style defined by the project's ESLint configuration. Run `pnpm run lint` to check for any stylistic issues.
