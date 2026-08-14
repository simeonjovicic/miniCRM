package com.collabcrm.controller;

import com.collabcrm.model.ExternalRevenue;
import com.collabcrm.model.FinanceEntry;
import com.collabcrm.model.FinanceSettings;
import com.collabcrm.service.FinanceService;
import com.collabcrm.service.FinanceSettingsService;
import com.collabcrm.service.FinanceStatsService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.Year;
import java.util.*;

/**
 * REST-Controller für Finanzverwaltung (Einnahmen + Ausgaben).
 * Broadcastet Änderungen per WebSocket an /topic/finance.
 */
@RestController
@RequestMapping("/api/finance")
public class FinanceController {

    private final FinanceService financeService;
    private final FinanceStatsService statsService;
    private final FinanceSettingsService settingsService;
    private final SimpMessagingTemplate messagingTemplate;

    public FinanceController(FinanceService financeService,
                             FinanceStatsService statsService,
                             FinanceSettingsService settingsService,
                             SimpMessagingTemplate messagingTemplate) {
        this.financeService = financeService;
        this.statsService = statsService;
        this.settingsService = settingsService;
        this.messagingTemplate = messagingTemplate;
    }

    @GetMapping
    public List<FinanceEntry> getAll() {
        return financeService.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public FinanceEntry create(@Valid @RequestBody FinanceEntry entry) {
        FinanceEntry created = financeService.create(entry);
        broadcast("FINANCE_CREATED", created.getId());
        return created;
    }

    @PutMapping("/{id}")
    public FinanceEntry update(@PathVariable UUID id, @Valid @RequestBody FinanceEntry entry) {
        FinanceEntry updated = financeService.update(id, entry);
        broadcast("FINANCE_UPDATED", updated.getId());
        return updated;
    }

    /**
     * Nur Status und Art umschalten — für den Klick direkt auf das Status-Abzeichen
     * in der Liste, ohne den Umweg über das Formular.
     */
    @PatchMapping("/{id}/status")
    public FinanceEntry updateStatus(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        FinanceEntry updated = financeService.updateStatus(id, body.get("status"), body.get("kind"));
        broadcast("FINANCE_UPDATED", updated.getId());
        return updated;
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        financeService.delete(id);
        broadcast("FINANCE_DELETED", id);
    }

    /**
     * Finanz-Statistiken für ein Kalenderjahr: Umsatz, Aufwand, Umsatzsteuer,
     * Gewinn, offene Posten und Grenzwert-Fortschritt pro Person.
     */
    @GetMapping("/stats")
    public Map<String, Object> getStats(@RequestParam(required = false) Integer year) {
        return statsService.stats(year != null ? year : Year.now().getValue());
    }

    @GetMapping("/settings")
    public FinanceSettings getSettings(@RequestParam(required = false) Integer year) {
        return settingsService.forYear(year != null ? year : Year.now().getValue());
    }

    /** Grenzbeträge und Aufteilungsbasis anpassen — die Werte sind Sache des Users. */
    @PutMapping("/settings")
    public FinanceSettings updateSettings(@RequestParam(required = false) Integer year,
                                          @RequestBody FinanceSettings settings) {
        FinanceSettings saved = settingsService.update(
                year != null ? year : Year.now().getValue(), settings);
        messagingTemplate.convertAndSend("/topic/finance", Map.of("type", "FINANCE_SETTINGS_UPDATED"));
        return saved;
    }

    private void broadcast(String type, UUID id) {
        // Nicht jede Aenderung haengt an einer Entitaet — die Nebenumsaetze etwa
        // betreffen das ganze Jahr. Map.of vertraegt kein null, daher HashMap.
        Map<String, Object> message = new HashMap<>();
        message.put("type", type);
        message.put("entityId", id != null ? id.toString() : null);
        messagingTemplate.convertAndSend("/topic/finance", message);
    }

    /**
     * Fachliche Fehler (unzulässiger USt-Satz, kaputte Anzahlungs-Verknüpfung,
     * Löschen einer Rechnung mit Anzahlungen) landen als 400 beim Client statt
     * als 500 — die Oberfläche zeigt die Meldung direkt an.
     */
    @ExceptionHandler({IllegalArgumentException.class, IllegalStateException.class})
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, String> handleBadRequest(RuntimeException ex) {
        return Map.of("error", ex.getMessage());
    }

    /* ── Umsatz ausserhalb dieses CRM ─────────────────────────────── */

    @GetMapping("/external")
    public List<ExternalRevenue> externalRevenue(
            @RequestParam(defaultValue = "#{T(java.time.Year).now().getValue()}") int year) {
        return settingsService.externalRevenue(year);
    }

    @PutMapping("/external/{userId}")
    public ExternalRevenue setExternalRevenue(
            @PathVariable UUID userId,
            @RequestParam(defaultValue = "#{T(java.time.Year).now().getValue()}") int year,
            @RequestBody ExternalRevenue body) {
        ExternalRevenue saved = settingsService.setExternalRevenue(
                year, userId, body.getUsername(), body.getAmount(), body.getNote());
        broadcast("FINANCE_UPDATED", null);
        return saved;
    }
}
