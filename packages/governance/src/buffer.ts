// biome-ignore lint/style/useNodejsImportProtocol: This intentionally imports the browser polyfill.
import { Buffer as BrowserBuffer } from "buffer";

// buffer@6 implements Node's Buffer API, but its bundled declaration predates
// bigint accessors and typed subarray(). Only the browser-safe runtime is imported.
export const Buffer =
	BrowserBuffer as unknown as typeof import("node:buffer").Buffer;
export type Buffer = import("node:buffer").Buffer;
