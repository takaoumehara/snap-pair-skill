/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** PartyKit host, e.g. `my-relay.me.partykit.dev` (overrides nothing if snap-pair.config.json sets partykit.host). */
  readonly VITE_PARTYKIT_HOST?: string;
}
