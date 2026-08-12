package com.collabcrm.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.data.jpa.domain.AbstractPersistable;

import java.time.Instant;
import java.util.UUID;

/**
 * Ein Kommentar an einem Todo — die Absprache steht damit dort, wo die Aufgabe
 * steht, statt in einem Chat daneben.
 *
 * Bewusst eine eigene Tabelle statt einer Liste am Todo: Kommentare werden nur
 * angehängt und einzeln gelöscht, nie im Block überschrieben. Ein Update am
 * Todo kann so keine Kommentare mitreißen.
 */
@Entity
@Table(name = "todo_comments", indexes = @Index(name = "idx_todo_comment_todo", columnList = "todoId"))
public class TodoComment extends AbstractPersistable<UUID> {

    /**
     * Kommt aus dem Pfad und wird erst im Service gesetzt — deshalb hier bewusst
     * ohne @NotNull, sonst schluege die Eingangsvalidierung fehl, bevor der
     * Service ueberhaupt drankommt. In der Datenbank bleibt die Spalte Pflicht.
     */
    @Column(nullable = false)
    private UUID todoId;

    @NotBlank
    @Column(nullable = false, columnDefinition = "TEXT")
    private String text;

    @NotNull
    @Column(nullable = false)
    private UUID createdBy;

    /** Username für die Anzeige ohne zusätzliche Abfrage */
    private String createdByUsername;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
    }

    public UUID getTodoId() { return todoId; }
    public void setTodoId(UUID todoId) { this.todoId = todoId; }

    public String getText() { return text; }
    public void setText(String text) { this.text = text; }

    public UUID getCreatedBy() { return createdBy; }
    public void setCreatedBy(UUID createdBy) { this.createdBy = createdBy; }

    public String getCreatedByUsername() { return createdByUsername; }
    public void setCreatedByUsername(String createdByUsername) { this.createdByUsername = createdByUsername; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
