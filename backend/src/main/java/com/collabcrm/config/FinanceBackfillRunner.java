package com.collabcrm.config;

import com.collabcrm.service.FinanceService;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Hebt beim Start Finanzeinträge aus der Zeit vor der USt-Erweiterung auf das
 * neue Schema.
 *
 * Nötig, weil die Datenbank mit ddl-auto=update arbeitet: die neuen Spalten
 * werden zwar angelegt, bleiben bei bestehenden Zeilen aber leer. Ohne Backfill
 * würden Alteinträge in den Auswertungen als 0 durchlaufen.
 *
 * Idempotent — nach dem ersten Lauf findet der Backfill nichts mehr.
 */
@Component
public class FinanceBackfillRunner implements ApplicationRunner {

    private final FinanceService financeService;

    public FinanceBackfillRunner(FinanceService financeService) {
        this.financeService = financeService;
    }

    @Override
    public void run(ApplicationArguments args) {
        financeService.backfillLegacyEntries();
    }
}
