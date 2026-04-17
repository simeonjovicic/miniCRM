package com.collabcrm.model;

import jakarta.persistence.*;
import org.springframework.data.jpa.domain.AbstractPersistable;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "time_entries")
public class TimeEntry extends AbstractPersistable<UUID> {

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false)
    private UUID userId;

    private String username;

    @Column(nullable = false, updatable = false)
    private Instant startedAt;

    private Instant stoppedAt;

    /** null while running, set on stop */
    private Long durationSeconds;

    /** optional link to a customer */
    private UUID customerId;

    /** optional link to a todo */
    private UUID todoId;

    @PrePersist
    void prePersist() {
        if (startedAt == null) startedAt = Instant.now();
    }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }

    public Instant getStoppedAt() { return stoppedAt; }
    public void setStoppedAt(Instant stoppedAt) { this.stoppedAt = stoppedAt; }

    public Long getDurationSeconds() { return durationSeconds; }
    public void setDurationSeconds(Long durationSeconds) { this.durationSeconds = durationSeconds; }

    public UUID getCustomerId() { return customerId; }
    public void setCustomerId(UUID customerId) { this.customerId = customerId; }

    public UUID getTodoId() { return todoId; }
    public void setTodoId(UUID todoId) { this.todoId = todoId; }
}
