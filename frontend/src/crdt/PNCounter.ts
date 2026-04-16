/**
 * PN-Counter (Positive-Negative Counter) — TypeScript-Version.
 *
 * Identische Logik wie PNCounter.java im Backend.
 * Verwendet für: Kontaktaufnahmen-Zähler pro Kunde.
 *
 * Jeder Node trackt seine eigenen Increment/Decrement-Zähler separat.
 * Merge: Pro Node das Maximum nehmen (nicht die Summe!).
 * Wert = sum(increments) - sum(decrements)
 */
export class PNCounter {
  // Pro Node: wie oft hat DIESER Node incrementiert
  private incs = new Map<string, number>();
  // Pro Node: wie oft hat DIESER Node decrementiert
  private decs = new Map<string, number>();

  /** Increment um 1 für den gegebenen Node */
  increment(nodeId: string): void {
    this.incs.set(nodeId, (this.incs.get(nodeId) ?? 0) + 1);
  }

  /** Decrement um 1 für den gegebenen Node */
  decrement(nodeId: string): void {
    this.decs.set(nodeId, (this.decs.get(nodeId) ?? 0) + 1);
  }

  /** Aktueller Zählerwert: Summe aller Increments minus Summe aller Decrements */
  get value(): number {
    let inc = 0;
    for (const v of this.incs.values()) inc += v;
    let dec = 0;
    for (const v of this.decs.values()) dec += v;
    return inc - dec;
  }

  /**
   * Merged einen anderen Counter: Pro Node das Maximum nehmen.
   * Max statt Summe, weil ein Node seinen Zähler nur erhöht —
   * bei max(3,2)=3 ist klar dass der Node 3x incrementiert hat, nicht 3+2=5.
   */
  merge(other: PNCounter): void {
    for (const [nodeId, count] of other.incs) {
      this.incs.set(nodeId, Math.max(this.incs.get(nodeId) ?? 0, count));
    }
    for (const [nodeId, count] of other.decs) {
      this.decs.set(nodeId, Math.max(this.decs.get(nodeId) ?? 0, count));
    }
  }
}
