package com.collabcrm.model;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Umsatz einer Person, der nicht in diesem CRM erfasst wird.
 *
 * Die Kleinunternehmergrenze gilt pro Steuersubjekt und zaehlt ALLE Umsaetze
 * einer Person zusammen — auch solche aus einer Taetigkeit ausserhalb der
 * gemeinsamen selbstaendigen Arbeit. Wer die hier nicht mitzaehlt, sieht eine
 * Grenze, die weiter weg wirkt als sie ist.
 *
 * Pro Jahr und Person, weil sowohl die Grenze als auch die Nebenumsaetze
 * jaehrlich andere sind.
 */
@Entity
@Table(
        name = "finance_external_revenue",
        uniqueConstraints = @UniqueConstraint(columnNames = {"year", "user_id"})
)
public class ExternalRevenue {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(nullable = false)
    private Integer year;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    private String username;

    /**
     * Bruttobetrag — die Kleinunternehmergrenze ist seit 2025 eine Brutto-Grenze,
     * daher wird hier nichts herausgerechnet.
     */
    @Column(precision = 12, scale = 2)
    private BigDecimal amount;

    /** Wofuer, damit im naechsten Jahr noch nachvollziehbar ist, was da steht. */
    private String note;

    public ExternalRevenue() {}

    public ExternalRevenue(Integer year, UUID userId, String username, BigDecimal amount, String note) {
        this.year = year;
        this.userId = userId;
        this.username = username;
        this.amount = amount;
        this.note = note;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public Integer getYear() { return year; }
    public void setYear(Integer year) { this.year = year; }

    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
}
