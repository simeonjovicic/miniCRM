package com.collabcrm.service;

import com.collabcrm.model.Todo;
import com.collabcrm.repository.TodoRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Service für Todo-CRUD-Operationen.
 * Todos werden sortiert: offene zuerst (done=false), dann nach Erstellungsdatum absteigend.
 */
@Service
@Transactional
public class TodoService {

    private final TodoRepository repository;

    public TodoService(TodoRepository repository) {
        this.repository = repository;
    }

    public List<Todo> findAll() {
        return repository.findAllByOrderByDoneAscCreatedAtDesc();
    }

    public Todo findById(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Todo not found: " + id));
    }

    public Todo create(Todo todo) {
        return repository.save(todo);
    }

    /** Partial Update: Nur gesetzte Felder werden aktualisiert, done wird immer übernommen. */
    public Todo update(UUID id, Todo updates) {
        Todo existing = findById(id);
        if (updates.getTitle() != null) existing.setTitle(updates.getTitle());
        if (updates.getPriority() != null) existing.setPriority(updates.getPriority());
        existing.setDone(updates.isDone());
        existing.setDueDate(updates.getDueDate());
        existing.setNotes(updates.getNotes());
        return repository.save(existing);
    }

    public void delete(UUID id) {
        repository.deleteById(id);
    }
}
