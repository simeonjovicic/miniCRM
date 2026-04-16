package com.collabcrm.repository;

import com.collabcrm.model.Todo;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * Repository für Todos.
 */
public interface TodoRepository extends JpaRepository<Todo, UUID> {
    /** Alle Todos: offene zuerst (done ASC), dann neueste zuerst (createdAt DESC) */
    List<Todo> findAllByOrderByDoneAscCreatedAtDesc();
}
