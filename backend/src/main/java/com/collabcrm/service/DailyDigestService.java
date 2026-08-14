package com.collabcrm.service;

import com.collabcrm.model.Appointment;
import com.collabcrm.model.DigestState;
import com.collabcrm.model.Todo;
import com.collabcrm.model.User;
import com.collabcrm.repository.AppointmentRepository;
import com.collabcrm.repository.DigestStateRepository;
import com.collabcrm.repository.TodoRepository;
import com.collabcrm.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Die tägliche Morgen-Übersicht: was heute ansteht, aufs Handy.
 *
 * Gedacht als Ersatz für das tägliche Durchgehen im Chat — man bekommt den Stand
 * ungefragt, statt in der Anwendung nachsehen zu müssen.
 *
 * <h2>Wer bekommt was</h2>
 * Jedes offene Todo landet in genau einer Übersicht, nie in zweien:
 * <ul>
 *   <li><b>Zugewiesen</b> — geht an das eigene ntfy-Thema der zuständigen Person.
 *       Wer keines hinterlegt hat, bekommt keine persönliche Übersicht; es wird
 *       dann auch nicht versucht.</li>
 *   <li><b>Niemandem zugewiesen</b> — geht an das gemeinsame Thema aus der
 *       Konfiguration, zusammen mit den Terminen des Tages und den offenen
 *       Rechnungen. Das ist der Teil, der beide angeht.</li>
 * </ul>
 * Die Trennung ist der eigentliche Zweck: sonst liest man morgens zweimal
 * dasselbe und hört bald auf hinzuschauen.
 *
 * <h2>Zwei Regeln halten sie erträglich</h2>
 * <ul>
 *   <li>Höchstens eine pro Tag <em>und Empfänger</em>, festgehalten in der
 *       Datenbank — ein Neustart des Pi darf sie nicht erneut auslösen.</li>
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
    private final DigestStateRepository stateRepository;
    private final UserRepository userRepository;
    private final NtfyService ntfy;

    private final boolean enabled;
    private final int digestHour;

    public DailyDigestService(TodoRepository todoRepository,
                              AppointmentRepository appointmentRepository,
                              FinanceStatsService financeStatsService,
                              DigestStateRepository stateRepository,
                              UserRepository userRepository,
                              NtfyService ntfy,
                              @Value("${reminders.digest-enabled}") boolean enabled,
                              @Value("${reminders.digest-hour}") int digestHour) {
        this.todoRepository = todoRepository;
        this.appointmentRepository = appointmentRepository;
        this.financeStatsService = financeStatsService;
        this.stateRepository = stateRepository;
        this.userRepository = userRepository;
        this.ntfy = ntfy;
        this.enabled = enabled;
        this.digestHour = digestHour;
    }

    /**
     * Verschickt die fälligen Übersichten — die gemeinsame und je eine pro
     * Person mit eigenem Thema.
     *
     * Jeder Empfänger wird für sich abgehakt: schlägt einer fehl, kommen die
     * anderen trotzdem an, und der fehlgeschlagene wird beim nächsten Durchlauf
     * erneut versucht.
     *
     * @return Anzahl der tatsächlich verschickten Nachrichten
     */
    public int sendIfDue(LocalDateTime now) {
        if (!enabled) return 0;
        if (now.getHour() < digestHour) return 0;

        LocalDate today = now.toLocalDate();
        List<Todo> open = openTodos();
        int sent = 0;

        if (ntfy.isEnabled()) {
            sent += deliver(DigestState.SHARED, null, buildSharedDigest(today, open), today) ? 1 : 0;
        }

        for (User user : userRepository.findAll()) {
            // Kein eigenes Thema: keine persönliche Übersicht. Bewusst ohne
            // Zustandseintrag — sobald eines hinterlegt wird, soll sie kommen.
            if (!user.hasNtfyTopic()) continue;

            UUID id = user.getId();
            if (id == null) continue;

            Optional<String> body = buildPersonalDigest(today, open, id);
            sent += deliver(DigestState.forUser(id), user.getNtfyTopic(), body, today) ? 1 : 0;
        }

        return sent;
    }

    /**
     * Stellt eine einzelne Übersicht zu und hakt den Tag ab.
     *
     * @param topic das Zielthema, oder {@code null} für das gemeinsame
     * @return true, wenn tatsächlich etwas verschickt wurde
     */
    private boolean deliver(String recipient, String topic, Optional<String> body, LocalDate today) {
        if (alreadySentOn(recipient, today)) return false;

        if (body.isEmpty()) {
            // Nichts zu melden — trotzdem abhaken, sonst wird es den restlichen
            // Tag bei jedem Durchlauf neu geprüft.
            markSent(recipient, today);
            return false;
        }

        String title = "Heute — " + today.format(DAY);
        boolean ok = topic == null
                ? ntfy.send(title, body.get())
                : ntfy.sendTo(topic, title, body.get());

        if (!ok) {
            // Nicht abhaken, damit es beim nächsten Lauf erneut versucht wird.
            return false;
        }
        markSent(recipient, today);
        log.info("Morgen-Übersicht verschickt an {} für {}", recipient, today);
        return true;
    }

    /** Offene Todos in derselben Reihenfolge, die auch die Liste zeigt. */
    private List<Todo> openTodos() {
        return todoRepository.findAll().stream()
                .filter(t -> !t.isDone())
                .sorted(TodoService.ORDER)
                .toList();
    }

    /** Was man heute tatsächlich angehen kann — ohne das, was beim Kunden liegt. */
    private static List<Todo> actionable(List<Todo> todos) {
        return todos.stream().filter(t -> !t.waitsOnCustomer()).toList();
    }

    /**
     * Die gemeinsame Übersicht: was niemandem allein gehört.
     *
     * Zugewiesene Todos bleiben bewusst draussen — die stehen in der
     * persönlichen Übersicht der zuständigen Person. Termine und offene
     * Rechnungen gehen dagegen beide an, die bleiben hier.
     */
    Optional<String> buildSharedDigest(LocalDate today, List<Todo> open) {
        List<Todo> unassigned = open.stream()
                .filter(t -> t.getAssigneeId() == null)
                .toList();

        List<Appointment> appointmentsToday = appointmentRepository
                .findByStartsAtAfterOrderByStartsAtAsc(today.atStartOfDay()).stream()
                .filter(a -> a.getStartsAt().toLocalDate().equals(today))
                .toList();

        BigDecimal openInvoices = financeStatsService.openReceivables().stream()
                .map(row -> (BigDecimal) row.get("open"))
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        if (actionable(unassigned).isEmpty()
                && appointmentsToday.isEmpty()
                && openInvoices.signum() == 0) {
            return Optional.empty();
        }

        StringBuilder body = new StringBuilder();
        appendTodoSection(body, today, unassigned, "offen");

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

    /** Die persönliche Übersicht: nur, was dieser Person zugewiesen ist. */
    Optional<String> buildPersonalDigest(LocalDate today, List<Todo> open, UUID userId) {
        List<Todo> mine = open.stream()
                .filter(t -> userId.equals(t.getAssigneeId()))
                .toList();

        if (actionable(mine).isEmpty()) return Optional.empty();

        StringBuilder body = new StringBuilder();
        appendTodoSection(body, today, mine, "für dich");
        return Optional.of(body.toString());
    }

    /**
     * Kopfzeile mit Zählung, darunter die gekürzte Liste.
     *
     * Wartendes wird getrennt ausgewiesen und zählt nicht als überfällig: eine
     * Frist, die verstrichen ist, während man auf den Kunden wartet, ist kein
     * Versäumnis — sie als solches zu melden, trainiert einen nur darauf, die
     * Zahl zu ignorieren.
     */
    private void appendTodoSection(StringBuilder body, LocalDate today,
                                   List<Todo> todos, String label) {
        List<Todo> actionable = actionable(todos);
        // Nur Wartendes loest keine Nachricht aus: "0 Todos offen (3 warten)"
        // waere jeden Morgen dasselbe und damit schnell nichts mehr wert.
        if (actionable.isEmpty()) return;

        List<Todo> waiting = todos.stream().filter(Todo::waitsOnCustomer).toList();

        List<Todo> overdue = actionable.stream()
                .filter(t -> t.getDueDate() != null && t.getDueDate().isBefore(today))
                .sorted(Comparator.comparing(Todo::getDueDate))
                .toList();

        List<Todo> dueToday = actionable.stream()
                .filter(t -> today.equals(t.getDueDate()))
                .toList();

        body.append(actionable.size()).append(actionable.size() == 1 ? " Todo " : " Todos ")
                .append(label);
        if (!overdue.isEmpty()) {
            body.append(", davon ").append(overdue.size()).append(" überfällig");
        }
        appendTodoLines(body, overdue, dueToday, actionable);

        if (!waiting.isEmpty()) {
            body.append("\n(").append(waiting.size())
                    .append(waiting.size() == 1 ? " wartet" : " warten").append(" auf Kunden)");
        }
    }

    /**
     * Erst die überfälligen, dann die heute fälligen, danach in der von Hand
     * gelegten Reihenfolge aufgefüllt — gekürzt auf das, was man morgens liest.
     *
     * Das Auffüllen ist wichtig: ohne es stünde bei Todos ohne Frist nur eine
     * nackte Zahl in der Nachricht, mit der niemand etwas anfangen kann.
     *
     * Aufgefüllt wird in Listenreihenfolge und nicht mehr nach Prioritätsstufe —
     * die Reihenfolge ist jetzt die Aussage darüber, was zuerst drankommt.
     */
    private void appendTodoLines(StringBuilder body, List<Todo> overdue,
                                 List<Todo> dueToday, List<Todo> open) {
        Set<Todo> listed = new LinkedHashSet<>();
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

        // open kommt bereits sortiert herein
        for (Todo todo : open) {
            if (listed.contains(todo)) continue;
            if (remaining-- <= 0) break;
            body.append("\n• ").append(todo.getTitle());
        }
    }

    private static String formatEuro(BigDecimal amount) {
        return String.format(Locale.GERMAN, "%,.2f €", amount);
    }

    private boolean alreadySentOn(String recipient, LocalDate day) {
        return stateRepository.findById(recipient)
                .map(state -> day.equals(state.getLastSentOn()))
                .orElse(false);
    }

    private void markSent(String recipient, LocalDate day) {
        DigestState state = stateRepository.findById(recipient)
                .orElseGet(() -> new DigestState(recipient, null));
        state.setLastSentOn(day);
        stateRepository.save(state);
    }

    /** Nur für die Anzeige in Tests und Log. */
    Map<String, Object> configuration() {
        return Map.of("enabled", enabled, "hour", digestHour);
    }
}
