import type { VatInputMode } from "../types";

/**
 * USt-Aufschlüsselung für die Live-Vorschau im Formular.
 *
 * Spiegelt bewusst die Rundungsregel des Backends (VatCalculator.java): es wird
 * immer nur EIN Wert gerundet, der dritte entsteht per Subtraktion. Dadurch
 * zeigt die Vorschau exakt das, was danach gespeichert wird — sonst springt der
 * Betrag beim Absenden um einen Cent.
 *
 * Maßgeblich bleibt trotzdem das Backend: es rechnet jeden Eintrag neu.
 */
export interface VatAmounts {
  net: number;
  vat: number;
  gross: number;
}

/** Auf Cent runden. Das EPSILON fängt Fälle wie 1.005 ab, die binär knapp darunter liegen. */
function toCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function splitVat(amount: number, mode: VatInputMode, rate: number): VatAmounts {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 0;

  if (mode === "NET") {
    const net = toCents(safeAmount);
    if (safeRate === 0) return { net, vat: 0, gross: net };
    const vat = toCents((net * safeRate) / 100);
    return { net, vat, gross: toCents(net + vat) };
  }

  const gross = toCents(safeAmount);
  if (safeRate === 0) return { net: gross, vat: 0, gross };
  const net = toCents(gross / (1 + safeRate / 100));
  return { net, vat: toCents(gross - net), gross };
}
