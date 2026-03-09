# AAM Helper

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Marketplace](https://img.shields.io/vscode-marketplace/v/ininids.aam-helper.svg)](https://marketplace.visualstudio.com/items?itemName=ininids.aam-helper)

Support for the AAM language format in Visual Studio Code. This extension provides syntax highlighting, language server features, and other utilities to enhance your experience when working with `.aam` files.

## Features

- **Syntax Highlighting:** Full syntax highlighting for AAM language files.
- **Auto-completion:** Smart autocompletion for elements and keywords based on the AAM language specification.
- **Formatting:** Built-in formatter for `.aam` files to maintain code consistency.
- **Linting:** Automatic linting to detect syntax errors and potential formatting issues.
- **Language Server Integration:** Powerful language intelligence for rapid development.

## Installation

1. Open Visual Studio Code.
2. Go to the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X`).
3. Search for `aam-helper`.
4. Click Install.

Alternatively, you can build the extension from source:

```bash
git clone https://github.com/ininids/aam-helper.git
cd aam-helper
pnpm install
pnpm run compile
```

Then, open the folder in VS Code and press `F5` to run the extension in a new Extension Development Host window.

## Usage

Simply open any `.aam` file to activate the extension. Language support will be automatically applied. 

## Contributing

Contributions are welcome! Please read the [Contributing Guidelines](CONTRIBUTING.md) to get started.

### Setting up the development environment

- `pnpm install` - Install dependencies
- `pnpm run compile` - Compile the TypeScript code
- `pnpm run watch` - Watch for changes and recompile

## License

This project is licensed under the [MIT License](LICENSE).
