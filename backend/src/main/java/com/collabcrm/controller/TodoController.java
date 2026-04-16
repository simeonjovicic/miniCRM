package com.collabcrm.controller;

import com.collabcrm.model.Todo;
import com.collabcrm.service.TodoService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * REST-Controller für Todos.
 * Jede Änderung wird per WebSocket an /topic/todos gebroadcastet,
 * damit alle Clients ihre Todo-Liste automatisch aktualisieren.
 */
@RestController
@RequestMapping("/api/todos")
public class TodoController {

    private final TodoService todoService;
    private final SimpMessagingTemplate messagingTemplate;

    public TodoController(TodoService todoService, SimpMessagingTemplate messagingTemplate) {
        this.todoService = todoService;
        this.messagingTemplate = messagingTemplate;
    }

    /** Alle Todos abrufen (sortiert: offene zuerst, dann nach Erstellungsdatum) */
    @GetMapping
    public List<Todo> getAll() {
        return todoService.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Todo create(@Valid @RequestBody Todo todo) {
        Todo created = todoService.create(todo);
        // Alle Clients benachrichtigen damit sie ihre Todo-Liste neu laden
        messagingTemplate.convertAndSend("/topic/todos",
                Map.of("type", "TODO_CHANGED"));
        return created;
    }

    @PutMapping("/{id}")
    public Todo update(@PathVariable UUID id, @RequestBody Todo todo) {
        Todo updated = todoService.update(id, todo);
        messagingTemplate.convertAndSend("/topic/todos",
                Map.of("type", "TODO_CHANGED"));
        return updated;
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        todoService.delete(id);
        messagingTemplate.convertAndSend("/topic/todos",
                Map.of("type", "TODO_CHANGED"));
    }
}
