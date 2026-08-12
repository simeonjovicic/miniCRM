package com.collabcrm.controller;

import com.collabcrm.model.Appointment;
import com.collabcrm.service.AppointmentService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * REST-Controller für Termine.
 * Änderungen gehen per WebSocket an /topic/appointments.
 */
@RestController
@RequestMapping("/api/appointments")
public class AppointmentController {

    private final AppointmentService appointmentService;
    private final SimpMessagingTemplate messagingTemplate;

    public AppointmentController(AppointmentService appointmentService,
                                 SimpMessagingTemplate messagingTemplate) {
        this.appointmentService = appointmentService;
        this.messagingTemplate = messagingTemplate;
    }

    @GetMapping
    public List<Appointment> getAll() {
        return appointmentService.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Appointment create(@Valid @RequestBody Appointment appointment) {
        Appointment created = appointmentService.create(appointment);
        broadcast();
        return created;
    }

    @PutMapping("/{id}")
    public Appointment update(@PathVariable UUID id, @RequestBody Appointment appointment) {
        Appointment updated = appointmentService.update(id, appointment);
        broadcast();
        return updated;
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        appointmentService.delete(id);
        broadcast();
    }

    private void broadcast() {
        messagingTemplate.convertAndSend("/topic/appointments",
                Map.of("type", "APPOINTMENT_CHANGED"));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, String> handleBadRequest(IllegalArgumentException ex) {
        return Map.of("error", ex.getMessage());
    }
}
