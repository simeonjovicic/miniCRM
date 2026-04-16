package com.collabcrm.repository;

import com.collabcrm.model.Customer;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * Repository für Kunden.
 * Spring Data JPA generiert die Implementierung automatisch aus den Methodennamen.
 */
public interface CustomerRepository extends JpaRepository<Customer, UUID> {
    /** Kunden nach Status filtern (z.B. alle LEADs) */
    List<Customer> findByStatus(String status);
    /** Kunden nach Name suchen (case-insensitive, Teilstring-Match) */
    List<Customer> findByNameContainingIgnoreCase(String name);
}
