package com.collabcrm.service;

import com.collabcrm.model.FinanceEntry;
import com.collabcrm.repository.FinanceEntryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Service für Finanzeinträge.
 * Kein Update — Einträge können nur erstellt und gelöscht werden (nur vom Ersteller).
 */
@Service
@Transactional
public class FinanceService {

    private final FinanceEntryRepository repository;

    public FinanceService(FinanceEntryRepository repository) {
        this.repository = repository;
    }

    /** Sortiert nach Datum und Erstellungszeitpunkt absteigend (neueste zuerst). */
    public List<FinanceEntry> findAll() {
        return repository.findAllByOrderByDateDescCreatedAtDesc();
    }

    public FinanceEntry create(FinanceEntry entry) {
        return repository.save(entry);
    }

    public FinanceEntry update(UUID id, FinanceEntry data) {
        FinanceEntry entry = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("FinanceEntry not found: " + id));
        if (data.getAmount() != null) entry.setAmount(data.getAmount());
        if (data.getType() != null) entry.setType(data.getType());
        if (data.getDescription() != null) entry.setDescription(data.getDescription());
        if (data.getDate() != null) entry.setDate(data.getDate());
        return repository.save(entry);
    }

    public void delete(UUID id) {
        repository.deleteById(id);
    }
}
