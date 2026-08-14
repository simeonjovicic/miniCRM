package com.collabcrm.service;

import com.collabcrm.model.Todo;
import com.collabcrm.model.TodoComment;
import com.collabcrm.repository.TodoCommentRepository;
import com.collabcrm.repository.TodoRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Service für Todo-CRUD-Operationen.
 *
 * Sortiert wird: offene zuerst, darin nach der von Hand gelegten Reihenfolge,
 * alles noch nie Einsortierte dahinter nach Alter absteigend.
 */
@Service
@Transactional
public class TodoService {

    private static final Logger log = LoggerFactory.getLogger(TodoService.class);

    private final TodoRepository repository;
    private final TodoCommentRepository commentRepository;

    public TodoService(TodoRepository repository, TodoCommentRepository commentRepository) {
        this.repository = repository;
        this.commentRepository = commentRepository;
    }

    public List<Todo> findAll() {
        List<Todo> todos = new java.util.ArrayList<>(repository.findAll());
        todos.sort(ORDER);

        // Kommentarzähler in einer Abfrage nachziehen statt einer pro Todo
        Map<UUID, Integer> counts = new HashMap<>();
        for (Object[] row : commentRepository.countGroupedByTodoId()) {
            counts.put((UUID) row[0], ((Number) row[1]).intValue());
        }
        todos.forEach(t -> t.setCommentCount(counts.getOrDefault(t.getId(), 0)));

        return todos;
    }

    /**
     * Offene zuerst, darin die von Hand gelegte Reihenfolge, der Rest nach
     * Alter absteigend.
     *
     * Sortiert wird in Java und nicht in der Abfrage: wo NULL-Werte landen,
     * handhaben die Datenbanken unterschiedlich — H2 und PostgreSQL kämen bei
     * noch nie einsortierten Todos zu verschiedenen Listen. Bei zwei Personen
     * ist die Datenmenge dafür ohnehin belanglos.
     */
    static final java.util.Comparator<Todo> ORDER =
            java.util.Comparator.comparing(Todo::isDone)
                    // Einsortiertes vor noch nie Einsortiertem
                    .thenComparing(t -> t.getPosition() == null)
                    .thenComparing(Todo::getPosition,
                            java.util.Comparator.nullsLast(java.util.Comparator.naturalOrder()))
                    // nullsLast, weil ein noch nicht gespeichertes Todo kein
                    // Anlagedatum hat — sonst faellt die Sortierung darueber.
                    .thenComparing(Todo::getCreatedAt,
                            java.util.Comparator.nullsLast(java.util.Comparator.reverseOrder()));

    /**
     * Legt die Reihenfolge neu fest. Erwartet die vollständige Liste in der
     * gewünschten Abfolge; alles darin bekommt seinen Platz von oben durchgezählt.
     *
     * Die Vollständigkeit ist Absicht: einzelne Plätze zu verschieben führt
     * schnell zu Lücken und Doppelbelegungen, sobald zwei Leute gleichzeitig
     * ziehen. Unbekannte IDs werden übergangen, damit ein veralteter Client
     * nicht die ganze Anfrage scheitern lässt.
     *
     * @return wie viele Todos einen neuen Platz bekommen haben
     */
    public int reorder(List<UUID> idsInOrder) {
        if (idsInOrder == null || idsInOrder.isEmpty()) return 0;

        Map<UUID, Todo> byId = new HashMap<>();
        repository.findAllById(idsInOrder).forEach(t -> byId.put(t.getId(), t));

        List<Todo> changed = new java.util.ArrayList<>();
        int next = 0;
        for (UUID id : idsInOrder) {
            Todo todo = byId.get(id);
            if (todo == null) continue;
            int place = next++;
            if (!Integer.valueOf(place).equals(todo.getPosition())) {
                todo.setPosition(place);
                changed.add(todo);
            }
        }
        repository.saveAll(changed);
        return changed.size();
    }

    // ── Kommentare ────────────────────────────────────────────────────

    public List<TodoComment> findComments(UUID todoId) {
        return commentRepository.findByTodoIdOrderByCreatedAtAsc(todoId);
    }

    public TodoComment addComment(UUID todoId, TodoComment comment) {
        // Wirft, wenn es das Todo nicht gibt — sonst hingen Kommentare im Leeren
        findById(todoId);
        comment.setTodoId(todoId);
        return commentRepository.save(comment);
    }

    public void deleteComment(UUID commentId) {
        commentRepository.deleteById(commentId);
    }

    public Todo findById(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Todo not found: " + id));
    }

    public Todo create(Todo todo) {
        if (todo.getPosition() == null) {
            todo.setPosition(topPosition());
        }
        return repository.save(todo);
    }

    /**
     * Ein Platz oberhalb von allem bisher Einsortierten.
     *
     * Neu Aufgeschriebenes gehört nach oben — ohne das fiele es unter alles
     * Sortierte und man müsste es erst hochziehen, um es überhaupt zu sehen.
     */
    private int topPosition() {
        return repository.findAll().stream()
                .map(Todo::getPosition)
                .filter(java.util.Objects::nonNull)
                .min(Integer::compareTo)
                .map(min -> min - 1)
                .orElse(0);
    }

    // ── Wiederkehrende Todos ──────────────────────────────────────────

    public static final String RECURRENCE_NONE = "NONE";

    /**
     * Legt den Nachfolger eines wiederkehrenden Todos an — beim Abhaken oder,
     * wenn es liegen bleibt, nach Ablauf der Frist über den Zeitplan.
     *
     * Genau einmal: das Kennzeichen am alten Todo verhindert, dass beide Wege
     * zusammen zwei Nachfolger erzeugen.
     */
    Optional<Todo> spawnNextOccurrence(Todo todo) {
        if (!isRecurring(todo) || Boolean.TRUE.equals(todo.getRecurrenceSpawned())) {
            return Optional.empty();
        }
        LocalDate next = nextDueDate(todo.getDueDate(), todo.getRecurrence());
        if (next == null) return Optional.empty();

        Todo successor = new Todo();
        successor.setTitle(todo.getTitle());
        successor.setNotes(todo.getNotes());
        // Am selben Platz wie der Vorgänger — ein wiederkehrendes Todo soll
        // nicht jedes Mal woanders in der Liste auftauchen.
        successor.setPosition(todo.getPosition());
        successor.setCustomerId(todo.getCustomerId());
        successor.setCustomerName(todo.getCustomerName());
        successor.setRecurrence(todo.getRecurrence());
        successor.setAssigneeId(todo.getAssigneeId());
        successor.setAssigneeUsername(todo.getAssigneeUsername());
        successor.setCreatedBy(todo.getCreatedBy());
        successor.setCreatedByUsername(todo.getCreatedByUsername());
        successor.setDueDate(next);
        successor.setDone(false);

        todo.setRecurrenceSpawned(true);
        repository.save(todo);

        Todo saved = repository.save(successor);
        log.info("Wiederkehrendes Todo '{}' neu angelegt für {}", saved.getTitle(), next);
        return Optional.of(saved);
    }

    static boolean isRecurring(Todo todo) {
        String recurrence = todo.getRecurrence();
        return recurrence != null && !recurrence.isBlank() && !RECURRENCE_NONE.equals(recurrence);
    }

    /**
     * Nächster Fälligkeitstag. Bei Monats- und Jahresschritten kürzt java.time
     * automatisch auf den letzten Tag des Zielmonats — der 31. wird im Februar
     * also zum 28., nicht zum 3. März.
     */
    static LocalDate nextDueDate(LocalDate from, String recurrence) {
        if (from == null || recurrence == null) return null;
        return switch (recurrence) {
            case "DAILY" -> from.plusDays(1);
            case "WEEKLY" -> from.plusWeeks(1);
            case "MONTHLY" -> from.plusMonths(1);
            case "QUARTERLY" -> from.plusMonths(3);
            case "YEARLY" -> from.plusYears(1);
            default -> null;
        };
    }

    /**
     * Fängt wiederkehrende Todos ab, deren Frist verstrichen ist, ohne dass sie
     * abgehakt wurden. Ohne das würde eine vergessene UVA die nächste gleich
     * mit verschlucken.
     */
    public int spawnOverdueRecurrences(LocalDate today) {
        List<Todo> spawned = repository.findAll().stream()
                .filter(TodoService::isRecurring)
                .filter(t -> !Boolean.TRUE.equals(t.getRecurrenceSpawned()))
                .filter(t -> t.getDueDate() != null && t.getDueDate().isBefore(today))
                .flatMap(t -> spawnNextOccurrence(t).stream())
                .toList();
        return spawned.size();
    }

    /**
     * Ersetzt das Todo durch den gesendeten Stand.
     *
     * ACHTUNG: done, dueDate, notes und die Kundenverknüpfung werden immer
     * übernommen — auch wenn sie leer sind, denn nur so lassen sie sich wieder
     * entfernen. Der Client muss deshalb das VOLLSTÄNDIGE Todo senden, nicht nur
     * das geänderte Feld, sonst gehen die übrigen Felder verloren.
     */
    public Todo update(UUID id, Todo updates) {
        Todo existing = findById(id);
        boolean wasOpen = !existing.isDone();

        if (updates.getTitle() != null) existing.setTitle(updates.getTitle());
        existing.setDone(updates.isDone());
        // Erledigtes wartet nicht mehr auf den Kunden.
        existing.setWaiting(updates.isDone() ? null : updates.getWaiting());
        existing.setDueDate(updates.getDueDate());
        existing.setNotes(updates.getNotes());
        existing.setCustomerId(updates.getCustomerId());
        existing.setCustomerName(updates.getCustomerName());
        existing.setRecurrence(updates.getRecurrence());
        existing.setAssigneeId(updates.getAssigneeId());
        existing.setAssigneeUsername(updates.getAssigneeUsername());

        Todo saved = repository.save(existing);

        // Beim Abhaken den nächsten Durchlauf anlegen
        if (wasOpen && saved.isDone()) {
            spawnNextOccurrence(saved);
        }
        return saved;
    }

    /** Löscht das Todo samt seiner Kommentare. */
    public void delete(UUID id) {
        commentRepository.deleteByTodoId(id);
        repository.deleteById(id);
    }
}
