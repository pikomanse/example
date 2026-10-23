/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PIKOMAN_APP: string;
  /** Only to try a server of your own; the client knows Pikoman's address. */
  readonly VITE_PIKOMAN_WS?: string;
}
