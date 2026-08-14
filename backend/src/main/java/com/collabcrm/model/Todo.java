package com.collabcrm.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.data.jpa.domain.AbstractPersistable;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * JPA Entity für Todos.
 * Todos können einem Kunden zugeordnet werden (über @Mention im Titel).
 */
@Entity
@Table(name = "todos")
public class Todo extends AbstractPersistable<UUID> {

    @NotBlank
    @Column(nullable = false)
    private String title;

    /** Ob das Todo erledigt ist */
    @Column(nullable = false)
    private boolean done;

    /** Priorität: LOW, MEDIUM oder HIGH — bestimmt die Farbcodierung im Frontend */
    @Column(length = 20)
    private String priority;

    /** Optionales Fälligkeitsdatum */
    private LocalDate dueDate;

    /** Optionale Notizen zum Todo (unbegrenzte Länge dank TEXT-Typ) */
    @Column(columnDefinition = "TEXT")
    private String notes;

    /**
     * Wiederholung: NONE, DAILY, WEEKLY, MONTHLY, QUARTERLY oder YEARLY.
     *
     * Ein wiederkehrendes Todo braucht ein Fälligkeitsdatum — daraus wird der
     * nächste Termin berechnet. Gerechnet wird immer ab dem alten Fälligkeitstag
     * und nicht ab heute, sonst wandert ein monatlicher Termin mit jeder
     * verspäteten Erledigung nach hinten.
     */
    @Column(length = 20)
    private String recurrence;

    /**
     * Ob der Nachfolger schon angelegt wurde. Sorgt dafür, dass es bei genau
     * einem bleibt — egal ob er beim Abhaken oder vom Zeitplan erzeugt wird.
     */
    @Column
    private Boolean recurrenceSpawned;

    /** Verknüpfter Kunde, gesetzt über die @-Erwähnung im Titel. */
    @Column
    private UUID customerId;

    /** Kundenname für die Anzeige ohne zusätzliche Abfrage. */
    private String customerName;

    /**
     * Anzahl der Kommentare — wird beim Laden der Liste gefüllt und nicht
     * gespeichert. So sieht man am Todo, dass eine Absprache dranhängt, ohne
     * für jedes einzeln nachladen zu müssen.
     */
    @Transient
    private int commentCount;

    /**
     * Wer es machen soll — im Unterschied zu {@link #createdBy}, wer es
     * aufgeschrieben hat. Zu zweit ist das die eigentlich interessante Angabe.
     * null heisst: noch niemandem zugewiesen.
     */
    @Column
    private UUID assigneeId;

    /** Name der zuständigen Person für die Anzeige ohne zusätzliche Abfrage */
    private String assigneeUsername;

    /** Welcher User dieses Todo erstellt hat */
    @NotNull
    @Column(nullable = false)
    private UUID createdBy;

    /** Username des Erstellers (für Anzeige, damit nicht jedes Mal der User geladen werden muss) */
    private String createdByUsername;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
        if (priority == null) priority = "MEDIUM"; // Default-Priorität
    }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public boolean isDone() { return done; }
    public void setDone(boolean done) { this.done = done; }

    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }

    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate dueDate) { this.dueDate = dueDate; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public String getRecurrence() { return recurrence; }
    public void setRecurrence(String recurrence) { this.recurrence = recurrence; }

    public Boolean getRecurrenceSpawned() { return recurrenceSpawned; }
    public void setRecurrenceSpawned(Boolean v) { this.recurrenceSpawned = v; }

    public UUID getCustomerId() { return customerId; }
    public void setCustomerId(UUID customerId) { this.customerId = customerId; }

    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }

    public int getCommentCount() { return commentCount; }
    public void setCommentCount(int commentCount) { this.commentCount = commentCount; }

    public UUID getAssigneeId() { return assigneeId; }
    public void setAssigneeId(UUID assigneeId) { this.assigneeId = assigneeId; }

    public String getAssigneeUsername() { return assigneeUsername; }
    public void setAssigneeUsername(String assigneeUsername) { this.assigneeUsername = assigneeUsername; }

    public UUID getCreatedBy() { return createdBy; }
    public void setCreatedBy(UUID createdBy) { this.createdBy = createdBy; }

    public String getCreatedByUsername() { return createdByUsername; }
    public void setCreatedByUsername(String createdByUsername) { this.createdByUsername = createdByUsername; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
