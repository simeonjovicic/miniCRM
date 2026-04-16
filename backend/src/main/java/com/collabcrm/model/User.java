package com.collabcrm.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import org.springframework.data.jpa.domain.AbstractPersistable;

import java.time.Instant;
import java.util.UUID;

/**
 * JPA Entity für Benutzer des CRM-Systems.
 * Username und Email sind jeweils unique — kein doppeltes Registrieren möglich.
 */
@Entity
@Table(name = "users")
public class User extends AbstractPersistable<UUID> {

    @NotBlank
    @Column(unique = true, nullable = false)
    private String username;

    @Email
    @NotBlank
    @Column(unique = true, nullable = false)
    private String email;

    /** Rolle im Team: ADMIN, SALES oder SUPPORT */
    @NotBlank
    @Column(nullable = false)
    private String role;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
