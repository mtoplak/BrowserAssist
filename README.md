# BrowserAssist Chrome Extension

This is a Chrome extension development template built with modern frontend technologies, designed to help developers quickly create powerful Chrome extensions. The project integrates **React**, **TypeScript**, **Tailwind CSS**, and **Webpack**, with a built-in React Hook for interacting with `chrome.storage` and support for communication between `popup` and `options` pages.

## Project Purpose

BrowserAssist is being developed as an accessibility-focused browser assistant, especially for disabled users who benefit from alternative interaction methods.

The goal is to make web navigation and actions easier through assistive inputs such as:

- Eye tracking
- Computer vision-based interaction

This extension acts as the browser-side interface for those assistive experiences.

## Features

- **React**: Build dynamic UIs with a component-based approach.
- **TypeScript**: Ensure type safety and improve code maintainability.
- **Tailwind CSS**: Rapidly create beautiful, responsive interfaces.
- **Webpack**: Modular bundling for development and production environments.
- **Chrome Storage Hook**: A custom React Hook to simplify `chrome.storage` interactions.
- **Popup & Options Interaction**: Enable communication between the extension’s `popup` and `options` pages.
- **Modular Design**: Easily extensible, ideal for rapid prototyping.

## Tech Stack

- React
- TypeScript
- Tailwind CSS
- Webpack
- Chrome Extension APIs
- DaisyUI

## How To Use In Development

1. Install dependencies

   ```bash
   npm install
   ```

2. Build

   ```bash
   npm run build
   ```

3. Load into Chrome
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable Developer mode
   - Click Load unpacked and select the `dist` folder from the project root

4. Develop and watch for changes

   ```bash
   npm run watch
   ```

   Note: If you change files such as `src/content.ts`, `src/background.ts`, or `src/manifest.json`, you may need to reload the extension in `chrome://extensions/`.

5. (Optional) Run development build directly

   ```bash
   npm run dev
   ```

Original template README: https://github.com/pickknow/chrome-extension-react-Tailwindcss-typescript

## Important Files

- `src/popup.tsx`: Extension popup interface
- `src/options.tsx`: Options page interface and settings controls
- `src/content.ts`: Content script that runs in the context of web pages
- `src/background.ts`: Background script for extension lifecycle/background tasks
- `src/tools/localStore.ts`: React hook wrapper for `chrome.storage.local`
- `src/tools/functions.ts`: Utility functions (including opening/focusing options)
- `src/compontments/CountShow.tsx`: Example reusable component using local storage
- `src/manifest.json`: Extension manifest (permissions, scripts, metadata)
- `src/popup.html`: Popup HTML entry
- `src/options.html`: Options HTML entry
- `src/index.css`: Shared Tailwind and custom UI styles
- `webpack.config.js`: Webpack build configuration
- `tailwind.config.js`: Tailwind CSS configuration

## Contributing

Contributions are welcome! Feel free to submit Issues or Pull Requests to improve this project. Follow these steps:

1. Fork this repository.
2. Create a new branch (git checkout -b feature/your-feature).
3. Commit your changes (git commit -m "Add new feature").
4. Push to the branch (git push origin feature/your-feature).
5. Create a Pull Request.

## License

This project is licensed under the MIT License (LICENSE).
