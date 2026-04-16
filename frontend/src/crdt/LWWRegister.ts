/**
 * LWW-Register (Last-Writer-Wins Register) — TypeScript-Version.
 *
 * Identische Logik wie LWWRegister.java im Backend.
 * Verwendet für: Jedes Kundenfeld (Name, Email, Firma, Telefon, Status).
 *
 * Merge-Regel: Höherer Timestamp gewinnt. Bei Gleichstand: höhere Node-ID (alphabetisch).
 */
export class LWWRegister<T> {
  private val: T;       // Der aktuelle Wert
  private ts: number;   // Lamport-Timestamp
  private node: string; // Node-ID des letzten Schreibers

  constructor(value: T, timestamp: number, nodeId: string) {
    this.val = value;
    this.ts = timestamp;
    this.node = nodeId;
  }

  /**
   * Versucht den Wert zu aktualisieren.
   * Gibt true zurück wenn der neue Wert übernommen wurde, false wenn er älter war.
   */
  set(value: T, timestamp: number, nodeId: string): boolean {
    if (
      timestamp > this.ts ||
      (timestamp === this.ts && nodeId > this.node)
    ) {
      this.val = value;
      this.ts = timestamp;
      this.node = nodeId;
      return true;
    }
    return false;
  }

  /** Merged ein anderes Register in dieses (nutzt die gleiche set()-Logik) */
  merge(other: LWWRegister<T>): void {
    this.set(other.val, other.ts, other.node);
  }

  get value(): T {
    return this.val;
  }

  get timestamp(): number {
    return this.ts;
  }

  get nodeId(): string {
    return this.node;
  }
}
