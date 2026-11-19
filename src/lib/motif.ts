export type Motif = "polos" | "batik";
export const MOTIF_STORAGE_KEY = "tapabsen-motif";
export const DEFAULT_MOTIF: Motif = "batik";

/**
 * Runs before first paint (inlined in the root layout) so the batik motif
 * never flashes in or out. Kept tiny and dependency-free on purpose.
 */
export const MOTIF_INIT_SCRIPT = `try{var m=localStorage.getItem(${JSON.stringify(MOTIF_STORAGE_KEY)});document.documentElement.dataset.motif=m==="polos"||m==="batik"?m:${JSON.stringify(DEFAULT_MOTIF)}}catch(e){document.documentElement.dataset.motif=${JSON.stringify(DEFAULT_MOTIF)}}`;
