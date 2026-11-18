# LEARN — Correction & Mistake Log

> Written whenever: (1) the owner explicitly corrects the AI, or (2) the AI recognizes it deviated from what was asked or from best practice. Format is compact but lossless.

**Template:** `[YYYY-MM-DD] - [problem] - [solution] - [lesson]`

---

<!-- Entries below, newest first -->

[2026-11-18] - Whole window went black after switching Layers -> Chat -> Layers ("destroy_ is not a function") - `ChatPanel` had `useEffect(() => el?.scrollIntoView(...))`; in Chromium 156 (Electron 45) scrollIntoView returns a Promise, React used it as the cleanup and the throw unmounted the tree. Fixed with braces; added a root `ErrorBoundary`, per-load core reconnect and `render-process-gone` reload - Effects always use a block body; never return an expression from an effect. A UI with no error boundary turns any render/effect throw into a blank window.
