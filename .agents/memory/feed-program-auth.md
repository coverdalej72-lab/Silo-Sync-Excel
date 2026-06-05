---
name: Feed program auth
description: Feed program should never have Clerk auth gate — it must open directly without sign-in.
---

The feed program (`artifacts/feed-program`) was originally created with no authentication:
```tsx
createRoot(document.getElementById("root")!).render(<App />);
```

A Clerk `AuthGate` was added during Task #2 (Multi-Farm Auth). This caused:
- Blank white screen in Replit preview pane (Clerk + iframe incompatible)
- Very slow first load (Clerk SDK must initialize before anything renders)
- Users confused / thinking the app was broken

**Why:** The feed program is a standalone spreadsheet tool shared via URL. It does not need to be gated — anyone with the link should open it directly.

**How to apply:** If the feed program's `main.tsx` ever gains a `ClerkProvider` or `AuthGate` wrapper, remove it. The correct main.tsx is just:
```tsx
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
createRoot(document.getElementById("root")!).render(<App />);
```

Note: `App.tsx` still imports `authFetch` for optional silo-sync API calls. Without a token getter set, those calls get 401s and fail silently — that is acceptable.
