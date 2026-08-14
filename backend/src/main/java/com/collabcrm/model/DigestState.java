package com.collabcrm.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Merkt sich je Empfänger, für welchen Tag die Morgen-Übersicht schon raus ist.
 *
 * Bewusst in der Datenbank und nicht im Speicher: ein Neustart des Pi würde
 * sonst dazu führen, dass die Übersicht am selben Tag noch einmal kommt.
 *
 * Der Schlüssel ist die Benutzer-ID als Text, für die gemeinsame Übersicht
 * {@link #SHARED}. Ein Text und keine UUID, weil beides in derselben Spalte
 * stehen muss — die gemeinsame Übersicht gehört keinem Benutzer.
 *
 * <p>Vorgänger war {@code daily_digest_state} mit einer einzigen Zeile. Da sich
 * der Schlüssel von {@code Integer} auf {@code String} ändert, ist das hier eine
 * neue Tabelle: {@code ddl-auto: update} ändert keine Spaltentypen, und eine
 * stehengebliebene NOT-NULL-Spalte ohne Vorgabewert würde jedes Einfügen
 * scheitern lassen. Die alte Tabelle kann von Hand entfernt werden.
 */
@Entity
@Table(name = "digest_state")
public class DigestState {

    /** Schlüssel der gemeinsamen Übersicht — die, die an beide geht. */
    public static final String SHARED = "shared";

    @Id
    @Column(name = "recipient", nullable = false)
    private String recipient;

    @Column(name = "last_sent_on")
    private LocalDate lastSentOn;

    protected DigestState() {}

    public DigestState(String recipient, LocalDate lastSentOn) {
        this.recipient = recipient;
        this.lastSentOn = lastSentOn;
    }

    /** Schlüssel für die persönliche Übersicht eines Benutzers. */
    public static String forUser(UUID userId) {
        return userId.toString();
    }

    public String getRecipient() { return recipient; }
    public void setRecipient(String recipient) { this.recipient = recipient; }

    public LocalDate getLastSentOn() { return lastSentOn; }
    public void setLastSentOn(LocalDate lastSentOn) { this.lastSentOn = lastSentOn; }
}
