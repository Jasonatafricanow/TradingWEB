import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  getHydrationLocale,
  readStoredLocale,
  writeStoredLocale,
} from "../locale-storage"

function storageWith(value: string | null) {
  return {
    written: null as { key: string; value: string } | null,
    getItem: (key: string) => (key === "locale" ? value : null),
    setItem(key: string, nextValue: string) {
      this.written = { key, value: nextValue }
    },
  }
}

describe("locale storage helpers", () => {
  it("uses the default locale for the hydration render", () => {
    assert.strictEqual(getHydrationLocale(), "zh")
  })

  it("reads a valid stored locale after hydration", () => {
    assert.strictEqual(readStoredLocale(storageWith("pt")), "pt")
    assert.strictEqual(readStoredLocale(storageWith("en")), "en")
  })

  it("ignores missing, unsupported, or unavailable storage", () => {
    assert.strictEqual(readStoredLocale(storageWith(null)), null)
    assert.strictEqual(readStoredLocale(storageWith("fr")), null)
    assert.strictEqual(readStoredLocale(null), null)
  })

  it("persists only supported locales", () => {
    const storage = storageWith(null)

    writeStoredLocale(storage, "pt")

    assert.deepStrictEqual(storage.written, { key: "locale", value: "pt" })
  })
})
