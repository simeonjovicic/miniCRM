/**
 * Lamport Clock — Logische Uhr für verteilte Systeme (TypeScript-Version).
 *
 * Identische Logik wie LamportClock.java im Backend.
 * Jeder Browser-Tab hat seine eigene Instanz.
 *
 * Garantiert kausale Ordnung: Wenn Aktion A vor B passiert → timestamp(A) < timestamp(B)
 * Nutzt keine Systemzeit → funktioniert auch wenn Geräte-Uhren nicht synchron sind.
 */
export class LamportClock {
  private counter: number;

  constructor(initial = 0) {
    this.counter = initial;
  }

  /** Eigene Aktion: Counter +1 und neuen Timestamp zurückgeben */
  tick(): number {
    return ++this.counter;
  }

  /** Nachricht empfangen: Counter = max(eigener, empfangener) + 1 */
  receive(received: number): number {
    this.counter = Math.max(this.counter, received) + 1;
    return this.counter;
  }

  /** Aktuellen Counter-Wert lesen */
  current(): number {
    return this.counter;
  }
}
