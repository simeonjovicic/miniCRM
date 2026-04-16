package com.collabcrm.controller;

import com.collabcrm.model.User;
import com.collabcrm.service.UserService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * REST-Controller für Benutzerverwaltung.
 * Einfaches CRUD ohne WebSocket-Broadcast — User-Daten ändern sich selten.
 */
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping
    public List<User> getAll() {
        return userService.findAll();
    }

    @GetMapping("/{id}")
    public User getById(@PathVariable UUID id) {
        return userService.findById(id);
    }

    /** Neuen User registrieren (Login/Signup) */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public User create(@Valid @RequestBody User user) {
        return userService.create(user);
    }
}
