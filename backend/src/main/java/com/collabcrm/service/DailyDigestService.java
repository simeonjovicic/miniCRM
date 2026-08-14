package com.collabcrm.service;

import com.collabcrm.model.Appointment;
import com.collabcrm.model.DailyDigestState;
import com.collabcrm.model.Todo;
import com.collabcrm.repository.AppointmentRepository;
import com.collabcrm.repository.DailyDigestStateRepository;
import com.collabcrm.repository.TodoRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Die tägliche Morgen-Übersicht: eine Nachricht mit allem, was heute ansteht.
 *
 * Gedacht als Ersatz für das tägliche Durchgehen im Chat — man bekommt den Stand
 * ungefragt, statt in der Anwendung nachsehen zu müssen.
 *
 * Zwei Regeln halten sie erträglich:
 * <ul>
 *   <li>Höchstens eine pro Tag, festgehalten in der Datenbank — ein Neustart
 *       des Pi darf sie nicht erneut auslösen.</li>
 *   <li>Gibt es nichts zu melden, kommt auch nichts. Eine Nachricht "0 offen"
 *       trainiert einen nur darauf, sie wegzuwischen.</li>
 * </ul>
 */
@Service
@Transactional
public class DailyDigestService {

    private static final Logger log = LoggerFactory.getLogger(DailyDigestService.class);

    private static final DateTimeFormatter DAY =
            DateTimeFormatter.ofPattern("EEE, dd.MM.", Locale.GERMAN);
    private static final DateTimeFormatter TIME =
            DateTimeFormatter.ofPattern("HH:mm", Locale.GERMAN);

    /** Mehr Zeilen liest morgens niemand. */
    private static final int MAX_LISTED_TODOS = 5;

    private final TodoRepository todoRepository;
    private final AppointmentRepository appointmentRepository;
    private final FinanceStatsService financeStatsService;
    private final DailyDigestStateRepository stateRepository;
    private final NtfyService ntfy;

    private final boolean enabled;
    private final int digestHour;

    public DailyDigestService(TodoRepository todoRepository,
                              AppointmentRepository appointmentRepository,
                              FinanceStatsService financeStatsService,
                              DailyDigestStateRepository stateRepository,
                              NtfyService ntfy,
                              @Value("${reminders.digest-enabled}") boolean enabled,
                              @Value("${reminders.digest-hour}") int digestHour) {
        this.todoRepository = todoRepository;
        this.appointmentRepository = appointmentRepository;
        this.financeStatsService = financeStatsService;
        this.stateRepository = stateRepository;
        this.ntfy = ntfy;
        this.enabled = enabled;
        this.digestHour = digestHour;
    }

    /**
     * Verschickt die Übersicht, wenn sie fällig und noch nicht raus ist.
     *
     * @return true, wenn eine Nachricht verschickt wurde
     */
    public boolean sendIfDue(LocalDateTime now) {
        if (!enabled || !ntfy.isEnabled()) return false;
        if (now.getHour() < digestHour) return false;
        if (alreadySentOn(now.toLocalDate())) return false;

        Optional<String> body = buildDigest(now.toLocalDate());
        if (body.isEmpty()) {
            // Nichts zu melden — trotzdem als erledigt vermerken, sonst wird es
            // den restlichen Tag bei jedem Durchlauf neu geprüft.
            markSent(now.toLocalDate());
            return false;
        }

        if (!ntfy.send("Heute — " + now.format(DAY), body.get())) {
            // Nicht als verschickt vermerken, damit es beim nächsten Lauf erneut versucht wird.
            return false;
        }
        markSent(now.toLocalDate());
        log.info("Morgen-Übersicht verschickt für {}", now.toLocalDate());
        return true;
    }

    /** Leer, wenn es nichts zu berichten gibt. */
    Optional<String> buildDigest(LocalDate today) {
        List<Todo> open = todoRepository.findAll().stream()
                .filter(t -> !t.isDone())
                .toList();

        List<Todo> overdue = open.stream()
                .filter(t -> t.getDueDate() != null && t.getDueDate().isBefore(today))
                .sorted(java.util.Comparator.comparing(Todo::getDueDate))
                .toList();

        List<Todo> dueToday = open.stream()
                .filter(t -> today.equals(t.getDueDate()))
                .toList();

        List<Appointment> appointmentsToday = appointmentRepository
                .findByStartsAtAfterOrderByStartsAtAsc(today.atStartOfDay()).stream()
                .filter(a -> a.getStartsAt().toLocalDate().equals(today))
                .toList();

        BigDecimal openInvoices = financeStatsService.openReceivables().stream()
                .map(row -> (BigDecimal) row.get("open"))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        boolean nothingToSay = open.isEmpty()
                && appointmentsToday.isEmpty()
                && openInvoices.signum() == 0;
        if (nothingToSay) return Optional.empty();

        StringBuilder body = new StringBuilder();

        if (!open.isEmpty()) {
            body.append(open.size()).append(open.size() == 1 ? " Todo offen" : " Todos offen");
            if (!overdue.isEmpty()) {
                body.append(", davon ").append(overdue.size()).append(" überfällig");
            }
            appendTodoLines(body, overdue, dueToday, open);
        }

        if (!appointmentsToday.isEmpty()) {
            if (body.length() > 0) body.append("\n\n");
            body.append(appointmentsToday.size() == 1 ? "Termin heute" : "Termine heute");
            for (Appointment appointment : appointmentsToday) {
                body.append("\n• ").append(appointment.getStartsAt().format(TIME))
                        .append("  ").append(appointment.getTitle());
            }
        }

        if (openInvoices.signum() > 0) {
            if (body.length() > 0) body.append("\n\n");
            body.append("Offen: ").append(formatEuro(openInvoices));
        }

        return Optional.of(body.toString());
    }

    /**
     * Erst die überfälligen, dann die heute fälligen, danach nach Dringlichkeit
     * aufgefüllt — gekürzt auf das, was man morgens noch liest.
     *
     * Das Auffüllen ist wichtig: ohne es stünde bei Todos ohne Frist nur eine
     * nackte Zahl in der Nachricht, mit der niemand etwas anfangen kann.
     */
    private void appendTodoLines(StringBuilder body, List<Todo> overdue,
                                 List<Todo> dueToday, List<Todo> open) {
        java.util.Set<Todo> listed = new java.util.LinkedHashSet<>();
        int remaining = MAX_LISTED_TODOS;

        for (Todo todo : overdue) {
            if (remaining-- <= 0) break;
            listed.add(todo);
            body.append("\n• ").append(todo.getTitle()).append("  — überfällig");
        }
        for (Todo todo : dueToday) {
            if (remaining-- <= 0) break;
            listed.add(todo);
            body.append("\n• ").append(todo.getTitle()).append("  — heute fällig");
        }

        List<Todo> rest = open.stream()
                .filter(t -> !listed.contains(t))
                .sorted(java.util.Comparator.comparingInt(t -> priorityRank(t.getPriority())))
                .toList();
        for (Todo todo : rest) {
            if (remaining-- <= 0) break;
            body.append("\n• ").append(todo.getTitle());
        }
    }

    private static int priorityRank(String priority) {
        return switch (priority == null ? "" : priority) {
            case "HIGH" -> 0;
            case "MEDIUM" -> 1;
            default -> 2;
        };
    }

    private static String formatEuro(BigDecimal amount) {
        return String.format(Locale.GERMAN, "%,.2f €", amount);
    }

    private boolean alreadySentOn(LocalDate day) {
        return stateRepository.findById(DailyDigestState.SINGLETON_ID)
                .map(state -> day.equals(state.getLastSentOn()))
                .orElse(false);
    }

    private void markSent(LocalDate day) {
        DailyDigestState state = stateRepository.findById(DailyDigestState.SINGLETON_ID)
                .orElseGet(() -> new DailyDigestState(null));
        state.setLastSentOn(day);
        stateRepository.save(state);
    }

    /** Nur für die Anzeige in Tests und Log. */
    Map<String, Object> configuration() {
        return Map.of("enabled", enabled, "hour", digestHour);
    }
}
