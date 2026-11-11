# Explainer video

A 94-second, 1920x1080 explainer of Nikasha and its connection to Vyaya, made with Remotion. It needs no sound: every point is written on screen in full sentences. Every figure comes from `src/data.json`, which is exported from the real engine run on the synthetic samples, so the video can be regenerated whenever the samples or rules change.

```bash
cd video
npm ci
npm run data                                # refresh src/data.json from the engine
npx remotion studio src/index.js            # preview and edit
npx remotion render src/index.js Explainer out/nikasha-vyaya-explainer.mp4 --codec=h264 --crf=18 --x264-preset=veryfast
```

Remotion downloads its own headless Chrome unless you pass `--browser-executable` (Playwright's `chromium_headless_shell` works). Remotion has its own licence terms; check them before any commercial use of the rendering toolchain. Working example on synthetic data, for illustration only.
