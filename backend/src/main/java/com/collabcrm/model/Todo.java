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

    /**
     * Liegt beim Kunden und nicht bei uns.
     *
     * Ein eigener Zustand, weil "seit zwei Wochen keine Antwort" und "noch nicht
     * angefangen" sonst gleich aussehen — obwohl man beim einen nichts tun kann.
     * Gilt nur für offene Todos; beim Abhaken fällt er weg.
     *
     * Wrapper-Typ und nicht {@code boolean}: eine neue NOT-NULL-Spalte ohne
     * Vorgabewert lässt sich in PostgreSQL nicht zu einer befüllten Tabelle
     * hinzufügen, und {@code ddl-auto: update} liefert keinen mit. null zählt
     * überall als "wartet nicht".
     */
    @Column
    private Boolean waiting;

    /**
     * Platz in der von Hand gelegten Reihenfolge, kleiner heisst weiter oben.
     *
     * Ersetzt die früheren Prioritätsstufen: "wichtig/mittel/unwichtig"
     * beantwortet nicht, womit man anfängt — eine Reihenfolge schon.
     *
     * null heisst "noch nie einsortiert" und sinkt hinter alles Sortierte,
     * innerhalb davon bleibt es bei "neueste zuerst". Damit sieht die Liste
     * unverändert aus, solange niemand etwas verschiebt.
     */
    @Column(name = "sort_position")
    private Integer position;

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
    }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public boolean isDone() { return done; }
    public void setDone(boolean done) { this.done = done; }

    public Boolean getWaiting() { return waiting; }
    public void setWaiting(Boolean waiting) { this.waiting = waiting; }

    /**
     * Wartet es gerade auf den Kunden? Erledigte warten nie.
     *
     * Bewusst ohne {@code get}/{@code is}-Vorsilbe: sonst hielte Jackson das
     * hier und {@link #getWaiting()} für dieselbe Eigenschaft und bräche ab.
     */
    public boolean waitsOnCustomer() {
        return Boolean.TRUE.equals(waiting) && !done;
    }

    public Integer getPosition() { return position; }
    public void setPosition(Integer position) { this.position = position; }

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
