/// <reference types="vite/client" />

import type { AppApiV2 } from "../shared/types";

declare global {
  interface Window {
    githubIntel?: AppApiV2;
  }
}
