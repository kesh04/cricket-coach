// Minimal Node types for the test scripts (the app itself does not use Node).
declare module 'fs' {
  export function writeFileSync(path: string, data: unknown): void;
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readdirSync(path: string): string[];
  export function existsSync(path: string): boolean;
}
declare const Buffer: {
  alloc(size: number): Uint8Array & { [i: number]: number };
  from(text: string): Uint8Array;
  concat(list: Uint8Array[]): Uint8Array;
};
declare const process: { env: Record<string, string | undefined>; argv: string[]; exit(code: number): never };
