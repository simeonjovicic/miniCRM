package com.collabcrm.repository;

import com.collabcrm.model.TodoComment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

public interface TodoCommentRepository extends JpaRepository<TodoComment, UUID> {

    /** Kommentare eines Todos in der Reihenfolge, in der sie geschrieben wurden. */
    List<TodoComment> findByTodoIdOrderByCreatedAtAsc(UUID todoId);

    /** Beim Löschen eines Todos verschwinden auch dessen Kommentare. */
    void deleteByTodoId(UUID todoId);

    /**
     * Anzahl Kommentare je Todo in einer Abfrage — damit die Liste die Zähler
     * ohne eine Abfrage pro Todo anzeigen kann.
     */
    @Query("select c.todoId, count(c) from TodoComment c group by c.todoId")
    List<Object[]> countGroupedByTodoId();
}
