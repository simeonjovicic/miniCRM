import { moveAfter, moveBefore, moveDown, moveUp } from "./reorder";

const ALLE = ["a", "b", "c", "d"];

describe("reorder", () => {
  // ── Vor ein Ziel ────────────────────────────────────────────────

  it("schiebt vor das Ziel", () => {
    expect(moveBefore(ALLE, "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("schiebt ohne Ziel ans Ende", () => {
    expect(moveBefore(ALLE, "a", null)).toEqual(["b", "c", "d", "a"]);
  });

  it("lässt die Liste in Ruhe, wenn das Ziel nicht existiert", () => {
    expect(moveBefore(ALLE, "a", "gibtsnicht")).toEqual(ALLE);
  });

  it("verdoppelt nichts, wenn man auf sich selbst schiebt", () => {
    expect(moveBefore(ALLE, "b", "b")).toEqual(ALLE);
  });

  // ── Hinter ein Ziel ─────────────────────────────────────────────

  it("schiebt hinter das Ziel", () => {
    expect(moveAfter(ALLE, "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("schiebt ohne Ziel an den Anfang", () => {
    expect(moveAfter(ALLE, "d", null)).toEqual(["d", "a", "b", "c"]);
  });

  // ── Einen Platz auf und ab ──────────────────────────────────────

  it("geht einen Platz nach oben", () => {
    expect(moveUp(ALLE, ALLE, "c")).toEqual(["a", "c", "b", "d"]);
  });

  it("geht einen Platz nach unten", () => {
    expect(moveDown(ALLE, ALLE, "b")).toEqual(["a", "c", "b", "d"]);
  });

  it("bleibt am oberen Ende stehen", () => {
    expect(moveUp(ALLE, ALLE, "a")).toEqual(ALLE);
  });

  it("bleibt am unteren Ende stehen", () => {
    expect(moveDown(ALLE, ALLE, "d")).toEqual(ALLE);
  });

  // ── Unter einem Filter ──────────────────────────────────────────

  /**
   * Der eigentliche Grund für diese Datei: sichtbar sind nur a und d, "nach
   * oben" muss d über a bringen — und b und c müssen ihre Plätze relativ
   * zueinander behalten, sonst ist die Liste nach dem Filter durcheinander.
   */
  it("misst 'nach oben' am sichtbaren Vorgänger, nicht am nächsten überhaupt", () => {
    expect(moveUp(ALLE, ["a", "d"], "d")).toEqual(["d", "a", "b", "c"]);
  });

  it("misst 'nach unten' am sichtbaren Nachfolger", () => {
    expect(moveDown(ALLE, ["a", "d"], "a")).toEqual(["b", "c", "d", "a"]);
  });

  it("lässt die Ausgeblendeten in ihrer Reihenfolge", () => {
    const ergebnis = moveUp(["a", "b", "c", "d", "e"], ["a", "e"], "e");

    expect(ergebnis.indexOf("b")).toBeLessThan(ergebnis.indexOf("c"));
    expect(ergebnis.indexOf("c")).toBeLessThan(ergebnis.indexOf("d"));
  });

  it("rührt nichts an, wenn das Element gar nicht sichtbar ist", () => {
    expect(moveUp(ALLE, ["a", "b"], "d")).toEqual(ALLE);
    expect(moveDown(ALLE, ["a", "b"], "d")).toEqual(ALLE);
  });
});
