import {
  createHash,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const PIN_ITERATIONS = 210_000;
const PIN_KEY_LENGTH = 32;
const PIN_DIGEST = "sha256";

export function issueOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function assertPinFormat(pin: string): void {
  if (!/^\d{4,8}$/.test(pin)) throw new Error("PIN_FORMAT_INVALID");
}

export function hashPosPin(pin: string): string {
  assertPinFormat(pin);
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(pin, salt, PIN_ITERATIONS, PIN_KEY_LENGTH, PIN_DIGEST).toString("hex");
  return `pbkdf2_sha256$${PIN_ITERATIONS}$${salt}$${hash}`;
}

export function verifyPosPin(pin: string, stored: string): boolean {
  if (!/^\d{4,8}$/.test(pin)) return false;
  const [algorithm, iterationsText, salt, expectedHex, extra] = stored.split("$");
  if (algorithm !== "pbkdf2_sha256" || extra !== undefined || !salt || !expectedHex) return false;
  const iterations = Number(iterationsText);
  if (iterations !== PIN_ITERATIONS || !/^[a-f0-9]{32}$/i.test(salt) || !/^[a-f0-9]{64}$/i.test(expectedHex)) {
    return false;
  }
  const actual = pbkdf2Sync(pin, salt, iterations, PIN_KEY_LENGTH, PIN_DIGEST);
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
