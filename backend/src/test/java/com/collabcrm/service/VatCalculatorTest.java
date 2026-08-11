package com.collabcrm.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class VatCalculatorTest {

    @Test
    void bruttoWirdInNettoUndUstZerlegt() {
        var a = VatCalculator.fromGross(new BigDecimal("120.00"), new BigDecimal("20"));

        assertThat(a.netAmount()).isEqualByComparingTo("100.00");
        assertThat(a.vatAmount()).isEqualByComparingTo("20.00");
        assertThat(a.grossAmount()).isEqualByComparingTo("120.00");
    }

    @Test
    void nettoBekommtUstAufgeschlagen() {
        var a = VatCalculator.fromNet(new BigDecimal("100.00"), new BigDecimal("20"));

        assertThat(a.netAmount()).isEqualByComparingTo("100.00");
        assertThat(a.vatAmount()).isEqualByComparingTo("20.00");
        assertThat(a.grossAmount()).isEqualByComparingTo("120.00");
    }

    /**
     * Der eigentliche Grund für die Subtraktions-Konstruktion: bei 100 brutto mit
     * 20 % ist das Netto 83,333... Würden Netto und USt unabhängig gerundet, käme
     * 83,33 + 16,67 = 100,00 nur zufällig hin — bei anderen Beträgen fehlt sonst
     * ein Cent.
     */
    @ParameterizedTest
    @CsvSource({
            "100.00, 20", "100.00, 10", "100.00, 13",
            "0.01, 20", "33.33, 20", "999999.99, 20",
            "1234.56, 13", "77.77, 10",
    })
    void nettoPlusUstErgibtImmerExaktBrutto(String gross, String rate) {
        var a = VatCalculator.fromGross(new BigDecimal(gross), new BigDecimal(rate));

        assertThat(a.netAmount().add(a.vatAmount()))
                .as("netto + ust muss exakt brutto ergeben")
                .isEqualByComparingTo(new BigDecimal(gross));
    }

    @ParameterizedTest
    @CsvSource({"100.00, 20", "0.01, 13", "4711.11, 10", "88.88, 20"})
    void nettoEingabeErgibtWiederDasselbeNetto(String net, String rate) {
        var a = VatCalculator.fromNet(new BigDecimal(net), new BigDecimal(rate));

        assertThat(a.grossAmount().subtract(a.vatAmount())).isEqualByComparingTo(new BigDecimal(net));
    }

    @Test
    void nullProzentLaesstDenBetragUnveraendert() {
        var brutto = VatCalculator.fromGross(new BigDecimal("250.00"), BigDecimal.ZERO);
        assertThat(brutto.netAmount()).isEqualByComparingTo("250.00");
        assertThat(brutto.vatAmount()).isEqualByComparingTo("0.00");

        var netto = VatCalculator.fromNet(new BigDecimal("250.00"), BigDecimal.ZERO);
        assertThat(netto.grossAmount()).isEqualByComparingTo("250.00");
        assertThat(netto.vatAmount()).isEqualByComparingTo("0.00");
    }

    @Test
    void ermaessigterSatzWirdKorrektGerechnet() {
        var zehn = VatCalculator.fromNet(new BigDecimal("100.00"), BigDecimal.TEN);
        assertThat(zehn.grossAmount()).isEqualByComparingTo("110.00");

        var dreizehn = VatCalculator.fromNet(new BigDecimal("100.00"), new BigDecimal("13"));
        assertThat(dreizehn.grossAmount()).isEqualByComparingTo("113.00");
    }

    @Test
    void fehlenderSatzGiltAlsNullProzentStattAlsFehler() {
        var a = VatCalculator.of(new BigDecimal("50.00"), VatCalculator.MODE_GROSS, null);

        assertThat(a.netAmount()).isEqualByComparingTo("50.00");
        assertThat(a.vatAmount()).isEqualByComparingTo("0.00");
    }

    @Test
    void modusEntscheidetUeberDieRichtung() {
        var brutto = VatCalculator.of(new BigDecimal("120.00"), VatCalculator.MODE_GROSS, new BigDecimal("20"));
        var netto = VatCalculator.of(new BigDecimal("120.00"), VatCalculator.MODE_NET, new BigDecimal("20"));

        assertThat(brutto.grossAmount()).isEqualByComparingTo("120.00");
        assertThat(netto.grossAmount()).isEqualByComparingTo("144.00");
    }

    @Test
    void nurBekannteSaetzeSindZulaessig() {
        assertThat(VatCalculator.isAllowedRate(new BigDecimal("20"))).isTrue();
        assertThat(VatCalculator.isAllowedRate(new BigDecimal("20.00"))).isTrue();
        assertThat(VatCalculator.isAllowedRate(BigDecimal.ZERO)).isTrue();
        assertThat(VatCalculator.isAllowedRate(new BigDecimal("19"))).isFalse();
        assertThat(VatCalculator.isAllowedRate(null)).isFalse();
    }
}
