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

    public UUID getCreatedBy() { return createdBy; }
    public void setCreatedBy(UUID createdBy) { this.createdBy = createdBy; }

    public String getCreatedByUsername() { return createdByUsername; }
    public void setCreatedByUsername(String createdByUsername) { this.createdByUsername = createdByUsername; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
