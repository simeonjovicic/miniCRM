/**
 * Dot — identifiziert ein einzelnes Add-Event eindeutig.
 */
export interface Dot {
  nodeId: string;
  timestamp: number;
}

/**
 * Entry — trackt Add- und Remove-Dots für ein Element.
 * Dots werden als serialisierte Strings "nodeId:timestamp" gespeichert
 * damit Set-Vergleiche korrekt funktionieren (JavaScript vergleicht Objekte by-reference).
 */
interface Entry<T> {
  value: T;
  addDots: Set<string>;    // serialisierte "nodeId:timestamp" Strings
  removeDots: Set<string>;
}

/** Serialisiert einen Dot zu einem eindeutigen String-Key */
function dotKey(d: Dot): string {
  return `${d.nodeId}:${d.timestamp}`;
}

/**
 * OR-Set (Observed-Remove Set) — TypeScript-Version.
 *
 * Identische Logik wie ORSet.java im Backend.
 * Verwendet für: Todo-Listen pro Kunde.
 *
 * Add-Wins-Semantik: Wenn User A ein Element entfernt und User B es gleichzeitig
 * hinzufügt, überlebt das Element — weil B's Dot nicht in A's Remove-Dots ist.
 */
export class ORSet<T> {
  // elementId → Entry mit allen Dots
  private entries = new Map<string, Entry<T>>();

  /** Fügt ein Element hinzu und erzeugt einen neuen Dot */
  add(elementId: string, value: T, nodeId: string, timestamp: number): void {
    let entry = this.entries.get(elementId);
    if (!entry) {
      entry = { value, addDots: new Set(), removeDots: new Set() };
      this.entries.set(elementId, entry);
    }
    entry.addDots.add(dotKey({ nodeId, timestamp }));
  }

  /**
   * Entfernt ein Element: Alle aktuellen Add-Dots werden zu Remove-Dots.
   * Neue Dots die gleichzeitig auf anderen Nodes entstehen überleben → Add-Wins.
   */
  remove(elementId: string): void {
    const entry = this.entries.get(elementId);
    if (entry) {
      for (const dot of entry.addDots) {
        entry.removeDots.add(dot);
      }
    }
  }

  /**
   * Prüft ob ein Element noch lebt:
   * Es lebt wenn mindestens ein Add-Dot existiert der nicht in Remove-Dots ist.
   */
  private isAlive(entry: Entry<T>): boolean {
    for (const dot of entry.addDots) {
      if (!entry.removeDots.has(dot)) return true;
    }
    return false;
  }

  /** Alle lebenden Elemente als Map (elementId → value) */
  get value(): Map<string, T> {
    const result = new Map<string, T>();
    for (const [id, entry] of this.entries) {
      if (this.isAlive(entry)) {
        result.set(id, entry.value);
      }
    }
    return result;
  }

  /** Anzahl der lebenden Elemente */
  get size(): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (this.isAlive(entry)) count++;
    }
    return count;
  }

  /** Merged ein anderes OR-Set: Vereinigung aller Add- und Remove-Dots pro Element */
  merge(other: ORSet<T>): void {
    for (const [id, otherEntry] of other.entries) {
      let entry = this.entries.get(id);
      if (!entry) {
        entry = {
          value: otherEntry.value,
          addDots: new Set(),
          removeDots: new Set(),
        };
        this.entries.set(id, entry);
      }
      for (const dot of otherEntry.addDots) entry.addDots.add(dot);
      for (const dot of otherEntry.removeDots) entry.removeDots.add(dot);
    }
  }
}
