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
 *
 * Betragsfelder: {@link #amount} ist immer der BRUTTObetrag, {@link #netAmount} und
 * {@link #vatAmount} werden daraus (bzw. daraus rückwärts) berechnet — siehe VatCalculator.
 * Es wird bewusst alles gespeichert statt nur zwei Werte: so lässt sich jederzeit nach
 * Netto oder Brutto summieren, ohne bei jeder Abfrage neu zu runden.
 *
 * Alle 2026 dazugekommenen Spalten sind absichtlich nullable. Hibernate mit
 * ddl-auto=update kann einer bereits befüllten Tabelle keine NOT-NULL-Spalte
 * hinzufügen; die Werte setzt stattdessen FinanceService.normalize() bzw. der
 * einmalige Backfill beim Start.
 */
@Entity
@Table(name = "finance_entries")
public class FinanceEntry extends AbstractPersistable<UUID> {

    /** Bruttobetrag mit 2 Nachkommastellen, max 12 Stellen gesamt */
    @NotNull
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    /** Nettobetrag (ohne USt) */
    @Column(precision = 12, scale = 2)
    private BigDecimal netAmount;

    /** USt-Betrag */
    @Column(precision = 12, scale = 2)
    private BigDecimal vatAmount;

    /** USt-Satz in Prozent: 0, 10, 13 oder 20 */
    @Column(precision = 5, scale = 2)
    private BigDecimal vatRate;

    /** Was der User eingetippt hat: "GROSS" oder "NET". Nur für die Rück-Bearbeitung im Formular. */
    @Column(length = 10)
    private String inputMode;

    /**
     * Nur für Ausgaben: ob die USt als Vorsteuer abziehbar ist.
     * Bei Bewirtung, Privatanteil oder Kleinunternehmer-Belegen ist sie das nicht —
     * dann sind die vollen Bruttokosten Aufwand.
     */
    @Column
    private Boolean vatDeductible;

    /** "INCOME" (Einnahme) oder "EXPENSE" (Ausgabe) */
    @NotBlank
    @Column(nullable = false, length = 20)
    private String type;

    /** "INVOICE" (normaler Eintrag/Rechnung) oder "DEPOSIT" (Anzahlung) */
    @Column(length = 20)
    private String kind;

    /**
     * Nur bei kind=DEPOSIT: die Schlussrechnung, auf die diese Anzahlung geht.
     * Ist sie gesetzt, zählt die Anzahlung als Zahlung auf diese Rechnung und
     * NICHT als eigener Umsatz — sonst wäre der Umsatz doppelt erfasst.
     * Ohne parentId ist die Anzahlung ein eigenständiger Umsatz.
     */
    @Column
    private UUID parentId;

    /** "DRAFT" (Entwurf), "SENT" (gesendet, Zahlung offen) oder "PAID" (bezahlt) */
    @Column(length = 20)
    private String status;

    /**
     * ALTBESTAND: früher wurde eine geteilte Einnahme als EIN Eintrag gespeichert
     * und erst beim Auswerten halbiert. Neue geteilte Einnahmen entstehen
     * stattdessen als zwei echte Buchungen (siehe {@link #splitGroupId}).
     * Das Feld bleibt, damit alte Einträge weiterhin korrekt ausgewertet werden.
     */
    @Column
    private UUID sharedWithUserId;

    /** Username des Partners für die Anzeige ohne zusätzliche DB-Abfrage */
    private String sharedWithUsername;

    /**
     * Klammer um die drei Buchungen einer geteilten Einnahme.
     *
     * Geteilt wird so, wie es zwischen zwei Einzelunternehmern tatsächlich
     * abläuft: der eine stellt dem Kunden die volle Rechnung, der andere stellt
     * ihm seinen Anteil in Rechnung. Aus einer geteilten Einnahme werden deshalb
     * drei Buchungen — siehe {@link #splitRole}.
     */
    @Column
    private UUID splitGroupId;

    /**
     * Rolle innerhalb der Aufteilung:
     * <ul>
     *   <li>{@code ORIGIN} — die volle Rechnung an den Kunden (beim Ersteller)</li>
     *   <li>{@code SHARE_IN} — die Anteilsrechnung des Partners (Einnahme beim Partner)</li>
     *   <li>{@code SHARE_OUT} — dieselbe Rechnung als Aufwand beim Ersteller</li>
     * </ul>
     */
    @Column(length = 20)
    private String splitRole;

    /** Name der jeweils anderen Person — nur für die Anzeige am Eintrag. */
    private String splitPartnerUsername;

    /** Verknüpfter Kunde, gesetzt über die @-Erwähnung in der Beschreibung. */
    @Column
    private UUID customerId;

    /** Kundenname für die Anzeige ohne zusätzliche Abfrage. */
    private String customerName;

    /** Pfad der angehängten Rechnung im Samba-Share, relativ zum Basisverzeichnis. */
    private String attachmentPath;

    /** Dateiname der angehängten Rechnung für die Anzeige. */
    private String attachmentName;

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

    /** true, wenn der Eintrag (Altbestand) beim Auswerten halbiert werden muss */
    @Transient
    public boolean isShared() {
        return sharedWithUserId != null;
    }

    /** true, wenn der Eintrag eine Hälfte einer geteilten Buchung ist */
    @Transient
    public boolean isSplitHalf() {
        return splitGroupId != null;
    }

    /** true, wenn es eine Anzahlung auf eine erfasste Schlussrechnung ist */
    @Transient
    public boolean isLinkedDeposit() {
        return "DEPOSIT".equals(kind) && parentId != null;
    }

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }

    public BigDecimal getNetAmount() { return netAmount; }
    public void setNetAmount(BigDecimal netAmount) { this.netAmount = netAmount; }

    public BigDecimal getVatAmount() { return vatAmount; }
    public void setVatAmount(BigDecimal vatAmount) { this.vatAmount = vatAmount; }

    public BigDecimal getVatRate() { return vatRate; }
    public void setVatRate(BigDecimal vatRate) { this.vatRate = vatRate; }

    public String getInputMode() { return inputMode; }
    public void setInputMode(String inputMode) { this.inputMode = inputMode; }

    public Boolean getVatDeductible() { return vatDeductible; }
    public void setVatDeductible(Boolean vatDeductible) { this.vatDeductible = vatDeductible; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }

    public UUID getParentId() { return parentId; }
    public void setParentId(UUID parentId) { this.parentId = parentId; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public UUID getSharedWithUserId() { return sharedWithUserId; }
    public void setSharedWithUserId(UUID sharedWithUserId) { this.sharedWithUserId = sharedWithUserId; }

    public String getSharedWithUsername() { return sharedWithUsername; }
    public void setSharedWithUsername(String sharedWithUsername) { this.sharedWithUsername = sharedWithUsername; }

    public UUID getSplitGroupId() { return splitGroupId; }
    public void setSplitGroupId(UUID splitGroupId) { this.splitGroupId = splitGroupId; }

    public String getSplitRole() { return splitRole; }
    public void setSplitRole(String splitRole) { this.splitRole = splitRole; }

    public String getSplitPartnerUsername() { return splitPartnerUsername; }
    public void setSplitPartnerUsername(String v) { this.splitPartnerUsername = v; }

    public UUID getCustomerId() { return customerId; }
    public void setCustomerId(UUID customerId) { this.customerId = customerId; }

    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }

    public String getAttachmentPath() { return attachmentPath; }
    public void setAttachmentPath(String attachmentPath) { this.attachmentPath = attachmentPath; }

    public String getAttachmentName() { return attachmentName; }
    public void setAttachmentName(String attachmentName) { this.attachmentName = attachmentName; }

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
