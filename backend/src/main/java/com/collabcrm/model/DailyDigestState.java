package com.collabcrm.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;

/**
 * Merkt sich, für welchen Tag die Morgen-Übersicht schon raus ist.
 *
 * Bewusst in der Datenbank und nicht im Speicher: ein Neustart des Pi würde
 * sonst dazu führen, dass die Übersicht am selben Tag noch einmal kommt.
 * Eine einzige Zeile, deshalb eine feste ID.
 */
@Entity
@Table(name = "daily_digest_state")
public class DailyDigestState {

    /** Es gibt nur diesen einen Datensatz. */
    public static final int SINGLETON_ID = 1;

    @Id
    private Integer id = SINGLETON_ID;

    @Column
    private LocalDate lastSentOn;

    protected DailyDigestState() {}

    public DailyDigestState(LocalDate lastSentOn) {
        this.id = SINGLETON_ID;
        this.lastSentOn = lastSentOn;
    }

    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }

    public LocalDate getLastSentOn() { return lastSentOn; }
    public void setLastSentOn(LocalDate lastSentOn) { this.lastSentOn = lastSentOn; }
}
