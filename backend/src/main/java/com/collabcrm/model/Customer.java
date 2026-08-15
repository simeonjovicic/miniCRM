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

    /**
     * ALTBESTAND: die Adresse als ein Freitextfeld. Für eine Rechnung taugt das
     * nicht — dort stehen Straße, Ort und Land in eigenen Zeilen. Ersetzt durch
     * die vier Felder darunter; die Spalte bleibt, damit alte Einträge nicht
     * verlorengehen.
     */
    private String address;

    /**
     * Rechnungsanschrift, getrennt nach Zeilen — genau so, wie sie im PDF steht.
     * Alles optional: ein Lead hat oft nur einen Namen, und eine unvollständige
     * Adresse ist besser als gar kein Kunde.
     */
    private String street;

    /** PLZ und Ort in einer Zeile, wie auf dem Kuvert: "1010 Wien". */
    private String zipCity;

    private String country;

    /** Umsatzsteuer-Identifikationsnummer, z. B. ATU12345678. */
    private String uid;

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

    public String getStreet() { return street; }
    public void setStreet(String street) { this.street = street; }

    public String getZipCity() { return zipCity; }
    public void setZipCity(String zipCity) { this.zipCity = zipCity; }

    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }

    public String getUid() { return uid; }
    public void setUid(String uid) { this.uid = uid; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public UUID getCreatedBy() { return createdBy; }
    public void setCreatedBy(UUID createdBy) { this.createdBy = createdBy; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
