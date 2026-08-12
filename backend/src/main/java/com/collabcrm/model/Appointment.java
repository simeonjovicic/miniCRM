package com.collabcrm.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.data.jpa.domain.AbstractPersistable;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Ein Termin — anders als ein Todo hat er eine feste Uhrzeit und wird nicht
 * abgehakt, sondern findet statt.
 *
 * Vor dem Termin verschickt der {@code ReminderScheduler} Erinnerungen aufs
 * Handy. Welche davon schon raus sind, steht in {@link #remindersSentDays},
 * damit eine Erinnerung nicht bei jedem Durchlauf erneut kommt.
 */
@Entity
@Table(name = "appointments")
public class Appointment extends AbstractPersistable<UUID> {

    @NotBlank
    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    /** Beginn des Termins — Datum UND Uhrzeit, im Gegensatz zur Todo-Fälligkeit. */
    @NotNull
    @Column(nullable = false)
    private LocalDateTime startsAt;

    /** Optionaler Ort oder Link zur Videokonferenz */
    private String location;

    /** Verknüpfter Kunde, gesetzt über die @-Erwähnung im Titel */
    @Column
    private UUID customerId;

    private String customerName;

    /**
     * Bereits verschickte Erinnerungen als Liste von Tagen vorher, z.B. "2,1".
     *
     * Beim Anlegen werden Vorlaufzeiten, die schon vorbei sind, direkt als
     * erledigt eingetragen — sonst käme bei einem Termin, den man einen Tag
     * vorher einträgt, sofort noch die Meldung "in 2 Tagen".
     */
    @Column(length = 100)
    private String remindersSentDays;

    @NotNull
    @Column(nullable = false)
    private UUID createdBy;

    private String createdByUsername;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
    }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public LocalDateTime getStartsAt() { return startsAt; }
    public void setStartsAt(LocalDateTime startsAt) { this.startsAt = startsAt; }

    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }

    public UUID getCustomerId() { return customerId; }
    public void setCustomerId(UUID customerId) { this.customerId = customerId; }

    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }

    public String getRemindersSentDays() { return remindersSentDays; }
    public void setRemindersSentDays(String remindersSentDays) { this.remindersSentDays = remindersSentDays; }

    public UUID getCreatedBy() { return createdBy; }
    public void setCreatedBy(UUID createdBy) { this.createdBy = createdBy; }

    public String getCreatedByUsername() { return createdByUsername; }
    public void setCreatedByUsername(String createdByUsername) { this.createdByUsername = createdByUsername; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
