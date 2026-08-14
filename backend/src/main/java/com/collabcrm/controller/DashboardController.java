package com.collabcrm.controller;

import com.collabcrm.model.Todo;
import com.collabcrm.service.FinanceStatsService;
import com.collabcrm.service.PresenceService;
import com.collabcrm.service.TodoService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.Year;
import java.util.*;

/**
 * REST-Controller für das Dashboard.
 *
 * Beantwortet die vier Fragen, die man beim Aufmachen hat: Was ist noch offen,
 * wer ist gerade da, welches Geld steht noch aus, und was hat jeder verdient.
 */
@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    /** Mehr passt auf der Startseite nicht sinnvoll hin — der Rest steht auf der jeweiligen Seite. */
    private static final int MAX_TODOS = 8;
    private static final int MAX_INVOICES = 6;

    private final TodoService todoService;
    private final FinanceStatsService financeStatsService;
    private final PresenceService presenceService;

    public DashboardController(TodoService todoService,
                               FinanceStatsService financeStatsService,
                               PresenceService presenceService) {
        this.todoService = todoService;
        this.financeStatsService = financeStatsService;
        this.presenceService = presenceService;
    }

    /**
     * Alles live berechnet — kein Caching, damit die Zahlen beim Aufmachen stimmen.
     */
    @GetMapping("/stats")
    public Map<String, Object> getStats(@RequestParam(required = false) Integer year) {
        int reportingYear = year != null ? year : Year.now().getValue();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("year", reportingYear);
        out.putAll(todoSection());
        out.put("onlineUsers", presenceService.getAllUsersPresence());
        out.putAll(invoiceSection());
        out.put("perUser", profitPerUser(reportingYear));
        return out;
    }

    /**
     * Offene Todos in der von Hand gelegten Reihenfolge — das ist ja die Antwort
     * auf "womit fange ich an". Wartendes rutscht ans Ende: es ist offen, aber
     * gerade nicht dran, und würde die ersten Plätze sonst blockieren.
     */
    private Map<String, Object> todoSection() {
        // findAll() liefert bereits sortiert; hier nur noch das Wartende absetzen
        List<Todo> open = todoService.findAll().stream()
                .filter(t -> !t.isDone())
                .sorted(Comparator.comparing(Todo::waitsOnCustomer))
                .toList();

        List<Map<String, Object>> rows = new ArrayList<>();
        for (Todo todo : open.stream().limit(MAX_TODOS).toList()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", todo.getId().toString());
            row.put("title", todo.getTitle());
            row.put("waiting", todo.waitsOnCustomer());
            row.put("dueDate", todo.getDueDate() != null ? todo.getDueDate().toString() : null);
            row.put("customerId", todo.getCustomerId() != null ? todo.getCustomerId().toString() : null);
            row.put("customerName", todo.getCustomerName());
            row.put("assigneeUsername", todo.getAssigneeUsername());
            row.put("createdByUsername", todo.getCreatedByUsername());
            rows.add(row);
        }

        Map<String, Object> section = new LinkedHashMap<>();
        section.put("openTodos", rows);
        section.put("openTodoCount", open.size());
        section.put("waitingTodoCount", open.stream().filter(Todo::waitsOnCustomer).count());
        return section;
    }

    /** Verschickte, aber noch nicht bezahlte Rechnungen — jahresübergreifend. */
    private Map<String, Object> invoiceSection() {
        List<Map<String, Object>> open = financeStatsService.openReceivables();

        BigDecimal total = open.stream()
                .map(row -> (BigDecimal) row.get("open"))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<String, Object> section = new LinkedHashMap<>();
        section.put("openInvoices", open.stream().limit(MAX_INVOICES).toList());
        section.put("openInvoiceCount", open.size());
        section.put("openInvoiceTotal", total);
        return section;
    }

    /** Gewinn je Person für das Berichtsjahr, der höchste zuerst. */
    private List<Map<String, Object>> profitPerUser(int year) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> perUser =
                (List<Map<String, Object>>) financeStatsService.stats(year).get("perUser");

        return perUser.stream()
                .map(u -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("userId", u.get("userId"));
                    row.put("username", u.get("username"));
                    row.put("profit", u.get("profit"));
                    row.put("revenueGross", u.get("revenueGross"));
                    row.put("openReceivables", u.get("openReceivables"));
                    return row;
                })
                .sorted(Comparator.comparing(
                        (Map<String, Object> r) -> (BigDecimal) r.get("profit")).reversed())
                .toList();
    }
}
