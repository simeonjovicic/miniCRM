package com.collabcrm.repository;

import com.collabcrm.model.FinanceEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * Repository für Finanzeinträge.
 */
public interface FinanceEntryRepository extends JpaRepository<FinanceEntry, UUID> {
    /** Alle Einträge, sortiert nach Datum und Erstellungszeitpunkt absteigend */
    List<FinanceEntry> findAllByOrderByDateDescCreatedAtDesc();
    /** Einträge eines bestimmten Users, sortiert nach Datum */
    List<FinanceEntry> findByCreatedByOrderByDateDesc(UUID createdBy);
}
