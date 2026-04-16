package com.collabcrm.controller;

import com.collabcrm.model.FinanceEntry;
import com.collabcrm.service.FinanceService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

/**
 * REST-Controller für Finanzverwaltung (Einnahmen + Ausgaben).
 * Broadcastet Änderungen per WebSocket an /topic/finance.
 */
@RestController
@RequestMapping("/api/finance")
public class FinanceController {

    private final FinanceService financeService;
    private final SimpMessagingTemplate messagingTemplate;

    public FinanceController(FinanceService financeService, SimpMessagingTemplate messagingTemplate) {
        this.financeService = financeService;
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
        messagingTemplate.convertAndSend("/topic/finance",
                Map.of("type", "FINANCE_CREATED", "entityId", created.getId().toString()));
        return created;
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        financeService.delete(id);
        messagingTemplate.convertAndSend("/topic/finance",
                Map.of("type", "FINANCE_DELETED", "entityId", id.toString()));
    }

    /**
     * Finanz-Statistiken: Gesamteinnahmen, -ausgaben, Gewinn und Pro-User-Aufschlüsselung.
     * Alles live berechnet aus den Finanzeinträgen.
     */
    @GetMapping("/stats")
    public Map<String, Object> getStats() {
        var entries = financeService.findAll();

        // Gesamteinnahmen berechnen (alle INCOME Einträge summieren)
        BigDecimal totalIncome = entries.stream()
                .filter(e -> "INCOME".equals(e.getType()))
                .map(FinanceEntry::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Gesamtausgaben berechnen
        BigDecimal totalExpense = entries.stream()
                .filter(e -> "EXPENSE".equals(e.getType()))
                .map(FinanceEntry::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Pro-User Aufschlüsselung: Einnahmen, Ausgaben und Gewinn pro Person
        var byUser = entries.stream()
                .collect(Collectors.groupingBy(
                        e -> e.getCreatedByUsername() != null ? e.getCreatedByUsername() : e.getCreatedBy().toString()));

        var perUser = new ArrayList<Map<String, Object>>();
        for (var entry : byUser.entrySet()) {
            BigDecimal userIncome = entry.getValue().stream()
                    .filter(e -> "INCOME".equals(e.getType()))
                    .map(FinanceEntry::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal userExpense = entry.getValue().stream()
                    .filter(e -> "EXPENSE".equals(e.getType()))
                    .map(FinanceEntry::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            perUser.add(Map.of(
                    "username", entry.getKey(),
                    "income", userIncome,
                    "expense", userExpense,
                    "profit", userIncome.subtract(userExpense)
            ));
        }

        return Map.of(
                "totalIncome", totalIncome,
                "totalExpense", totalExpense,
                "profit", totalIncome.subtract(totalExpense),
                "perUser", perUser
        );
    }
}
