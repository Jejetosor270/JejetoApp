import { describe, expect, it } from "vitest";
import { matchProjectNames } from "./project-matching";

const bled = { id: "bled", name: "Villas Bled", code: "VB-1" };
const other = { id: "other", name: "Villa Apsaras", code: "AP-2" };

describe("bounded Project name matching", () => {
  it.each([
    "villa bled",
    "VILLAS BLED",
    "Villas Bléd",
    "villa-bled",
    "bled villa",
    "  bled, villas  ",
  ])("normalizes %s without guessing a different Project", (query) => {
    expect(matchProjectNames(query, [bled, other])).toEqual([
      { project: bled, requiresConfirmation: false },
    ]);
  });

  it.each(["villa beld", "villa bleed", "villa blid", "vila bled"])(
    "proposes one-token typo %s for confirmation",
    (query) => {
      expect(matchProjectNames(query, [bled, other])).toEqual([
        { project: bled, requiresConfirmation: true },
      ]);
    },
  );

  it("matches punctuation and alphanumeric code boundaries without changing digits", () => {
    expect(matchProjectNames("vb1", [bled])).toEqual([
      { project: bled, requiresConfirmation: false },
    ]);
    expect(matchProjectNames("AP-1", [other])).toEqual([]);
    expect(matchProjectNames("AP-02", [other])).toEqual([]);
    expect(matchProjectNames("AB-2", [other])).toEqual([]);
  });

  it("does not auto-resolve reordered alphabetic code components", () => {
    const candidate = { id: "coded", name: "Unrelated Project", code: "CD-AB" };
    expect(matchProjectNames("AB-CD", [candidate])).toEqual([]);
    const longer = { ...candidate, code: "BETA-ALPHA" };
    expect(
      matchProjectNames("ALPHA-BETA", [longer]).every(
        (match) => match.requiresConfirmation,
      ),
    ).toBe(true);
  });

  it("never corrects Project numeric identifiers", () => {
    const projects = [
      { id: "one", name: "Project 1", code: "P1" },
      { id: "two", name: "Project 2", code: "P2" },
    ];
    expect(
      matchProjectNames("Project1", projects).map((match) => match.project.id),
    ).toEqual(["one"]);
    expect(matchProjectNames("Project 3", projects)).toEqual([]);
    expect(
      matchProjectNames("villa bled 2", [{ ...bled, name: "Villas Bled 1" }]),
    ).toEqual([]);
  });

  it.each([
    ["BL-12-3", "BL-3-12"],
    ["Villa 1 Block 2", "Villa 2 Block 1"],
    ["Villa 1 Block 2", "Block 1 Villa 2"],
  ])("does not reorder numeric identity %s into %s", (query, name) => {
    expect(
      matchProjectNames(query, [{ id: "different", name, code: name }]),
    ).toEqual([]);
  });

  it.each([
    "villa",
    "villas",
    "vila",
    "ble",
    "bld",
    "xx",
    "random orchard",
    "vila beld",
    "",
  ])(
    "does not turn weak or unrelated query %s into a confident suggestion",
    (query) => {
      expect(matchProjectNames(query, [bled, other])).toEqual([]);
    },
  );

  it("requires confirmation for normalized token subsets", () => {
    expect(matchProjectNames("bled", [bled])).toEqual([
      { project: bled, requiresConfirmation: true },
    ]);
  });

  it("keeps all normalized plausible Projects and ranks full matches first", () => {
    const north = { id: "north", name: "Villas Bled North", code: "NORTH" };
    const duplicate = { ...bled, id: "duplicate", name: "Villa Bléd" };
    const typo = { id: "typo", name: "Villa Bleds", code: "TYPO" };
    const matches = matchProjectNames("bled villa", [
      north,
      bled,
      duplicate,
      typo,
    ]);
    expect(matches.map((match) => match.project.id)).toEqual([
      "duplicate",
      "bled",
      "north",
    ]);
    expect(matches[2]?.requiresConfirmation).toBe(true);
  });

  it("never arbitrarily selects the first plausible typo match", () => {
    const otherBled = { id: "other-bled", name: "Villa Blend", code: "OTHER" };
    expect(matchProjectNames("villa bleed", [otherBled, bled])).toHaveLength(2);
    expect(
      matchProjectNames("villa bleed", [otherBled, bled]).every(
        (match) => match.requiresConfirmation,
      ),
    ).toBe(true);
  });

  it("does not reuse one candidate token for duplicate query tokens", () => {
    expect(matchProjectNames("bled bled", [bled])).toEqual([]);
  });

  it("rejects oversized queries and uses stable ID tie-breaking", () => {
    expect(matchProjectNames("a".repeat(101), [bled])).toEqual([]);
    const a = { ...bled, id: "a" };
    const z = { ...bled, id: "z" };
    expect(
      matchProjectNames("villa bled", [z, a]).map((match) => match.project.id),
    ).toEqual(["a", "z"]);
  });
});
