package com.collabcrm.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * Umsatzsteuer-Rechnung für Finanzeinträge.
 *
 * Zwei Eingaberichtungen, weil beides im Alltag vorkommt: vom Beleg abgetippt ist
 * brutto, selbst kalkuliert ist netto.
 *
 * Gerundet wird immer nur EIN Wert (auf 2 Nachkommastellen, HALF_UP), der dritte
 * entsteht per Subtraktion. Dadurch gilt netto + ust == brutto exakt — sonst
 * verschieben sich Summen über viele Einträge hinweg um Cent-Beträge.
 */
public final class VatCalculator {

    private VatCalculator() {}

    /** In Österreich gebräuchliche Sätze. 0 = keine USt (Kleinunternehmer, Reverse Charge, steuerfrei). */
    public static final List<BigDecimal> ALLOWED_RATES = List.of(
            BigDecimal.ZERO,
            BigDecimal.TEN,
            new BigDecimal("13"),
            new BigDecimal("20")
    );

    public static final String MODE_GROSS = "GROSS";
    public static final String MODE_NET = "NET";

    private static final BigDecimal HUNDRED = new BigDecimal("100");
    private static final int SCALE = 2;

    /** Ergebnis einer Aufteilung. netAmount + vatAmount ergibt immer exakt grossAmount. */
    public record Amounts(BigDecimal netAmount, BigDecimal vatAmount, BigDecimal grossAmount) {}

    /**
     * Rechnet aus dem eingegebenen Betrag alle drei Werte aus.
     *
     * @param amount    der eingetippte Betrag
     * @param inputMode "GROSS" oder "NET" — wie {@code amount} zu verstehen ist
     * @param rate      USt-Satz in Prozent (0, 10, 13, 20)
     */
    public static Amounts of(BigDecimal amount, String inputMode, BigDecimal rate) {
        return MODE_NET.equals(inputMode) ? fromNet(amount, rate) : fromGross(amount, rate);
    }

    /** Brutto ist bekannt, Netto wird herausgerechnet: netto = brutto / (1 + satz/100). */
    public static Amounts fromGross(BigDecimal gross, BigDecimal rate) {
        BigDecimal g = scaled(gross);
        BigDecimal r = normalizeRate(rate);

        if (r.signum() == 0) {
            return new Amounts(g, zero(), g);
        }
        BigDecimal divisor = BigDecimal.ONE.add(r.divide(HUNDRED, 10, RoundingMode.HALF_UP));
        BigDecimal net = g.divide(divisor, SCALE, RoundingMode.HALF_UP);
        return new Amounts(net, g.subtract(net), g);
    }

    /** Netto ist bekannt, USt kommt drauf: ust = netto * satz/100. */
    public static Amounts fromNet(BigDecimal net, BigDecimal rate) {
        BigDecimal n = scaled(net);
        BigDecimal r = normalizeRate(rate);

        if (r.signum() == 0) {
            return new Amounts(n, zero(), n);
        }
        BigDecimal vat = n.multiply(r).divide(HUNDRED, SCALE, RoundingMode.HALF_UP);
        return new Amounts(n, vat, n.add(vat));
    }

    /** Unbekannte oder fehlende Sätze werden als 0 behandelt, statt zu werfen. */
    private static BigDecimal normalizeRate(BigDecimal rate) {
        if (rate == null || rate.signum() < 0) return zero();
        return rate;
    }

    public static boolean isAllowedRate(BigDecimal rate) {
        return rate != null && ALLOWED_RATES.stream().anyMatch(r -> r.compareTo(rate) == 0);
    }

    private static BigDecimal scaled(BigDecimal value) {
        return (value == null ? zero() : value).setScale(SCALE, RoundingMode.HALF_UP);
    }

    private static BigDecimal zero() {
        return BigDecimal.ZERO.setScale(SCALE);
    }
}
