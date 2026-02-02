/**
 * Type declarations for bs58 module.
 * bs58 provides Base58 encoding/decoding functionality commonly used in cryptocurrency applications.
 */
declare module "bs58" {
  /**
   * Encode a buffer or Uint8Array to a Base58 string.
   */
  function encode(input: Uint8Array | Buffer): string;

  /**
   * Decode a Base58 string to a Uint8Array.
   */
  function decode(input: string): Uint8Array;

  export { encode, decode };
  export default { encode, decode };
}
