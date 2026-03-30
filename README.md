# BrowserAssist

An accessibility-focused Chrome extension that lets users navigate the web using hand gestures and eye tracking. All processing runs locally via MediaPipe — no webcam data leaves your device.

## Features

### Hand Gesture Control

Real-time hand tracking through your webcam with support for:

| Gesture            | Action                      |
| ------------------ | --------------------------- |
| Point up (hold)    | Scroll up                   |
| Point down (hold)  | Scroll down                 |
| Point left (hold)  | Browser back                |
| Point right (hold) | Browser forward             |
| Point + dwell      | Click element under pointer |
| Pinch in           | Zoom out                    |
| Pinch out          | Zoom in                     |
| Open palm (hold)   | Zoom out                    |

A built-in gesture cheatsheet is accessible from the extension panel.

### Eye Tracking

Gaze-based control with a 9-point calibration system:

- Iris detection via MediaPipe FaceLandmarker
- Dwell clicking (hold gaze on an element to click)
- Edge-based scrolling (look at top/bottom of screen to scroll)
- Edge-based backwards navigation
- Smoothed gaze point via exponential moving average

### Visual Overlays

The content script renders on-page indicators:

- Blue pointer dot showing current gaze/finger position
- Dashed ring highlighting the hovered element
- Status badge (top-right) showing the current action

### Privacy

- Camera frames are processed locally in the browser
- Only landmark coordinates are passed to the content script
- No external servers or telemetry

## Tech Stack

- React 19, TypeScript, Tailwind CSS, DaisyUI
- Webpack 5 (Manifest V3)
- MediaPipe Tasks Vision (hand + face landmark detection)
- Chrome Side Panel API

## Getting Started

### Prerequisites

- Node.js
- Google Chrome

### Install and build

```bash
npm install
npm run build
```

### Load into Chrome

1. Navigate to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist` folder

### Development

```bash
npm run watch
```

Changes to `src/content.ts`, `src/background.ts`, or `src/manifest.json` require reloading the extension in `chrome://extensions/`.

## Project Structure

```
src/
  popup.tsx                     Main side-panel UI (gesture + eye tracking tabs)
  content.ts                    Page overlays and action handlers
  background.ts                 Service worker (side panel setup)
  cheatsheet.tsx                Gesture reference page
  permission.ts                 Camera permission popup
  manifest.json                 Extension manifest
  features/
    gesture/GesturePanel.tsx    Hand tracking engine
    eye/EyeTrackingPanel.tsx    Eye tracking engine
  tools/
    gestureTypes.ts             Shared message/action types
    localStore.ts               React hook for chrome.storage.local
```

## Contributing

Contributions are welcome. To get started:

1. Fork this repository
2. Create a branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Push and open a pull request
