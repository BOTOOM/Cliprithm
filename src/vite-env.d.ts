/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __CLIPRITHM_DISTRIBUTION__: {
  channel: string;
  updateStrategy: string;
  packageName: string | null;
  storeName: string | null;
  storeUrl: string | null;
  storeInstructions: string | null;
  versionSourceType: string | null;
  versionSourceUrl: string | null;
};
