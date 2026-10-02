import { createHash } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { sha256Hex, shortHash } from "./hash.js";

describe("sha256Hex", () => {
  it.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    [
      "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    ],
    [
      "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu",
      "cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1",
    ],
  ])("matches the FIPS 180-4 test vector for %j", (input, expected) => {
    expect(sha256Hex(input)).toBe(expected);
  });

  it("handles one million repetitions of 'a'", () => {
    expect(sha256Hex("a".repeat(1_000_000))).toBe(
      "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    );
  });

  it("handles every length around the padding boundaries", () => {
    for (let length = 0; length <= 130; length++) {
      const input = "x".repeat(length);
      expect(sha256Hex(input)).toBe(createHash("sha256").update(input, "utf8").digest("hex"));
    }
  });

  it("agrees with node:crypto on arbitrary unicode strings", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme", maxLength: 300 }), (input) => {
        expect(sha256Hex(input)).toBe(createHash("sha256").update(input, "utf8").digest("hex"));
      }),
    );
  });

  it("agrees with node:crypto on arbitrary bytes", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 500 }), (bytes) => {
        expect(sha256Hex(bytes)).toBe(createHash("sha256").update(bytes).digest("hex"));
      }),
    );
  });
});

describe("shortHash", () => {
  it("is the 16-digit prefix of the SHA-256 digest", () => {
    expect(shortHash("abc")).toBe("ba7816bf8f01cfea");
  });
});
