package com.collabcrm.service;

import com.collabcrm.model.Todo;
import com.collabcrm.model.TodoComment;
import com.collabcrm.repository.TodoCommentRepository;
import com.collabcrm.repository.TodoRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Service für Todo-CRUD-Operationen.
 * Todos werden sortiert: offene zuerst (done=false), dann nach Erstellungsdatum absteigend.
 */
@Service
@Transactional
public class TodoService {

    private final TodoRepository repository;
    private final TodoCommentRepository commentRepository;

    public TodoService(TodoRepository repository, TodoCommentRepository commentRepository) {
        this.repository = repository;
        this.commentRepository = commentRepository;
    }

    public List<Todo> findAll() {
        List<Todo> todos = repository.findAllByOrderByDoneAscCreatedAtDesc();

        // Kommentarzähler in einer Abfrage nachziehen statt einer pro Todo
        Map<UUID, Integer> counts = new HashMap<>();
        for (Object[] row : commentRepository.countGroupedByTodoId()) {
            counts.put((UUID) row[0], ((Number) row[1]).intValue());
        }
        todos.forEach(t -> t.setCommentCount(counts.getOrDefault(t.getId(), 0)));

        return todos;
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
        return repository.save(todo);
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
        if (updates.getTitle() != null) existing.setTitle(updates.getTitle());
        if (updates.getPriority() != null) existing.setPriority(updates.getPriority());
        existing.setDone(updates.isDone());
        existing.setDueDate(updates.getDueDate());
        existing.setNotes(updates.getNotes());
        existing.setCustomerId(updates.getCustomerId());
        existing.setCustomerName(updates.getCustomerName());
        return repository.save(existing);
    }

    /** Löscht das Todo samt seiner Kommentare. */
    public void delete(UUID id) {
        commentRepository.deleteByTodoId(id);
        repository.deleteById(id);
    }
}
