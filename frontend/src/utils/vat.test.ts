import { splitVat } from "./vat";

describe("splitVat", () => {
  it("rechnet Netto aus einem Bruttobetrag heraus", () => {
    expect(splitVat(120, "GROSS", 20)).toEqual({ net: 100, vat: 20, gross: 120 });
  });

  it("schlägt USt auf einen Nettobetrag auf", () => {
    expect(splitVat(100, "NET", 20)).toEqual({ net: 100, vat: 20, gross: 120 });
  });

  it("lässt den Betrag bei 0 % unverändert", () => {
    expect(splitVat(250, "GROSS", 0)).toEqual({ net: 250, vat: 0, gross: 250 });
    expect(splitVat(250, "NET", 0)).toEqual({ net: 250, vat: 0, gross: 250 });
  });

  it("beherrscht die ermäßigten Sätze", () => {
    expect(splitVat(100, "NET", 10).gross).toBe(110);
    expect(splitVat(100, "NET", 13).gross).toBe(113);
  });

  /**
   * Muss sich exakt wie VatCalculator.java verhalten, sonst springt der Betrag
   * beim Speichern gegenüber der Vorschau um einen Cent.
   */
  it.each([
    [100, 20],
    [100, 10],
    [100, 13],
    [0.01, 20],
    [33.33, 20],
    [1234.56, 13],
    [77.77, 10],
    [999999.99, 20],
  ])("netto + USt ergibt bei %s brutto mit %s %% wieder exakt brutto", (gross, rate) => {
    const { net, vat } = splitVat(gross, "GROSS", rate);

    expect(Math.round((net + vat) * 100) / 100).toBe(gross);
  });

  it("rundet auf zwei Nachkommastellen", () => {
    const { net, vat } = splitVat(100, "GROSS", 20);

    expect(net).toBe(83.33);
    expect(vat).toBe(16.67);
  });

  it("verträgt leere und unsinnige Eingaben", () => {
    expect(splitVat(NaN, "GROSS", 20)).toEqual({ net: 0, vat: 0, gross: 0 });
    expect(splitVat(100, "GROSS", NaN)).toEqual({ net: 100, vat: 0, gross: 100 });
    expect(splitVat(100, "GROSS", -5)).toEqual({ net: 100, vat: 0, gross: 100 });
  });
});
