package com.collabcrm.repository;

import com.collabcrm.model.Todo;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/**
 * Repository für Todos.
 *
 * Ohne eigene Sortierabfrage: seit die Reihenfolge von Hand gelegt wird, sortiert
 * {@link com.collabcrm.service.TodoService} in Java — die Datenbanken sind sich
 * nicht einig, wo NULL-Werte hingehören.
 */
public interface TodoRepository extends JpaRepository<Todo, UUID> {
}
