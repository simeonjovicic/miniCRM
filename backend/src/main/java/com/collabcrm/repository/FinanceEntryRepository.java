package com.collabcrm.repository;

import com.collabcrm.model.FinanceEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
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

    /** Einträge eines Kalenderjahres — Basis für Grenzwerte und Jahresstatistik */
    List<FinanceEntry> findByDateBetweenOrderByDateDescCreatedAtDesc(LocalDate from, LocalDate to);

    /** Anzahlungen, die auf eine bestimmte Rechnung verweisen */
    List<FinanceEntry> findByParentId(UUID parentId);

    /** Beide Hälften einer geteilten Buchung */
    List<FinanceEntry> findBySplitGroupId(UUID splitGroupId);

    /** Altdaten ohne aufgeschlüsselte Beträge — vom Backfill beim Start eingesammelt */
    @Query("select e from FinanceEntry e where e.netAmount is null or e.status is null or e.kind is null")
    List<FinanceEntry> findNeedingBackfill();

    /** Verhindert das Löschen einer Rechnung, an der noch Anzahlungen hängen */
    @Query("select count(e) from FinanceEntry e where e.parentId = :parentId")
    long countByParentId(@Param("parentId") UUID parentId);
}
