package com.collabcrm.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.data.jpa.domain.AbstractPersistable;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.Instant;
import java.util.UUID;

/**
 * JPA Entity für Finanzeinträge (Einnahmen und Ausgaben).
 * BigDecimal für Beträge — vermeidet Rundungsfehler die bei double/float auftreten.
 */
@Entity
@Table(name = "finance_entries")
public class FinanceEntry extends AbstractPersistable<UUID> {

    /** Betrag mit 2 Nachkommastellen, max 12 Stellen gesamt */
    @NotNull
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    /** "INCOME" (Einnahme) oder "EXPENSE" (Ausgabe) */
    @NotBlank
    @Column(nullable = false, length = 20)
    private String type;

    @NotBlank
    @Column(nullable = false)
    private String description;

    /** Datum des Finanzeintrags (nicht Erstellungsdatum) */
    @NotNull
    @Column(nullable = false)
    private LocalDate date;

    /** Welcher User den Eintrag erstellt hat — nur dieser darf ihn löschen */
    @NotNull
    @Column(nullable = false)
    private UUID createdBy;

    /** Username für Anzeige ohne zusätzliche DB-Abfrage */
    private String createdByUsername;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public LocalDate getDate() { return date; }
    public void setDate(LocalDate date) { this.date = date; }

    public UUID getCreatedBy() { return createdBy; }
    public void setCreatedBy(UUID createdBy) { this.createdBy = createdBy; }

    public String getCreatedByUsername() { return createdByUsername; }
    public void setCreatedByUsername(String createdByUsername) { this.createdByUsername = createdByUsername; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
