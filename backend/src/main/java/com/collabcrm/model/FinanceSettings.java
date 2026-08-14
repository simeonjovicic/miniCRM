package com.collabcrm.model;

import jakarta.persistence.*;

import java.math.BigDecimal;

/**
 * Finanz-Einstellungen pro Kalenderjahr.
 *
 * Pro Jahr, weil sich sowohl die SVS-Versicherungsgrenze als auch die
 * Kleinunternehmergrenze regelmäßig ändern. Alte Jahre behalten dadurch die
 * Werte, mit denen damals gerechnet wurde.
 *
 * Die Startwerte kommen aus application.yml und sind ausdrücklich Platzhalter —
 * die gültigen Beträge trägt man in der Oberfläche ein.
 */
@Entity
@Table(name = "finance_settings")
public class FinanceSettings {

    /**
     * Kalenderjahr, für das diese Werte gelten.
     *
     * Die Spalte heisst bewusst nicht "year": das ist in H2 ein reserviertes
     * Wort, wodurch sich die Tabelle dort nicht anlegen liess. PostgreSQL
     * verkraftet es, aber die Tests laufen gegen H2.
     */
    @Id
    @Column(name = "fiscal_year")
    private Integer year;

    /**
     * SVS-Versicherungsgrenze: wird gegen den GEWINN gerechnet
     * (Einnahmen minus Ausgaben), nicht gegen den Umsatz.
     */
    @Column(precision = 12, scale = 2)
    private BigDecimal svsThreshold;

    /**
     * Kleinunternehmergrenze für die Umsatzsteuer: wird gegen den UMSATZ
     * gerechnet, also ohne Abzug von Ausgaben.
     */
    @Column(precision = 12, scale = 2)
    private BigDecimal smallBusinessThreshold;

    /**
     * Basis für die 50/50-Aufteilung geteilter Einnahmen: "GROSS" oder "NET".
     *
     * Bei GROSS wird der volle Rechnungsbetrag halbiert — dann trägt aber der
     * Rechnungssteller die USt allein. Bei NET wird nur der Nettobetrag geteilt
     * und die USt bleibt beim Rechnungssteller, der sie auch abführt.
     */
    @Column(length = 10)
    private String splitBasis;

    protected FinanceSettings() {}

    public FinanceSettings(Integer year, BigDecimal svsThreshold,
                           BigDecimal smallBusinessThreshold, String splitBasis) {
        this.year = year;
        this.svsThreshold = svsThreshold;
        this.smallBusinessThreshold = smallBusinessThreshold;
        this.splitBasis = splitBasis;
    }

    public Integer getYear() { return year; }
    public void setYear(Integer year) { this.year = year; }

    public BigDecimal getSvsThreshold() { return svsThreshold; }
    public void setSvsThreshold(BigDecimal svsThreshold) { this.svsThreshold = svsThreshold; }

    public BigDecimal getSmallBusinessThreshold() { return smallBusinessThreshold; }
    public void setSmallBusinessThreshold(BigDecimal v) { this.smallBusinessThreshold = v; }

    public String getSplitBasis() { return splitBasis; }
    public void setSplitBasis(String splitBasis) { this.splitBasis = splitBasis; }
}
