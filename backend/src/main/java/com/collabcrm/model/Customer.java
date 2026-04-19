package com.collabcrm.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import org.springframework.data.jpa.domain.AbstractPersistable;

import java.time.Instant;
import java.util.UUID;

/**
 * JPA Entity für Kunden.
 *
 * Die Kundendaten existieren an zwei Stellen:
 *   1. Hier in der customers-Tabelle → für REST-Abfragen (Kundenliste, Suche)
 *   2. In der crdt_state-Tabelle → als CRDT-Zustand (für konfliktfreie Synchronisation)
 *
 * Der CrdtSyncService hält beide synchron: Nach jedem CRDT-Merge wird auch diese Entity aktualisiert.
 *
 * AbstractPersistable<UUID> liefert automatisch ein id-Feld mit UUID als Primary Key.
 */
@Entity
@Table(name = "customers")
public class Customer extends AbstractPersistable<UUID> {

    @NotBlank
    @Column(nullable = false)
    private String name;

    private String email;

    private String company;

    private String phone;

    private String address;

    /** Kunden-Status in der Sales-Pipeline: LEAD → PROSPECT → CUSTOMER → CHURNED */
    @Column(nullable = false)
    private String status;

    /** Welcher User diesen Kunden erstellt hat */
    @Column(nullable = false)
    private UUID createdBy;

    /** Erstellungszeitpunkt — wird nur einmal gesetzt und nie überschrieben (updatable = false) */
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    /** JPA Lifecycle Hook: Setzt Defaults beim ersten Speichern */
    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        if (status == null) {
            status = "LEAD"; // Jeder neue Kunde startet als Lead
        }
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getCompany() { return company; }
    public void setCompany(String company) { this.company = company; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public UUID getCreatedBy() { return createdBy; }
    public void setCreatedBy(UUID createdBy) { this.createdBy = createdBy; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
