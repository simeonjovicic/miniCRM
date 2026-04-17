package com.collabcrm.controller;

import com.collabcrm.model.TimeEntry;
import com.collabcrm.service.TimeEntryService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/time-entries")
public class TimeEntryController {

    private final TimeEntryService service;
    private final SimpMessagingTemplate messaging;

    public TimeEntryController(TimeEntryService service, SimpMessagingTemplate messaging) {
        this.service = service;
        this.messaging = messaging;
    }

    @GetMapping
    public List<TimeEntry> getAll() {
        return service.findAll();
    }

    @GetMapping("/active/{userId}")
    public ResponseEntity<TimeEntry> getActive(@PathVariable UUID userId) {
        return service.findActive(userId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.noContent().build());
    }

    @PostMapping("/start")
    @ResponseStatus(HttpStatus.CREATED)
    public TimeEntry start(@RequestBody Map<String, String> body) {
        TimeEntry entry = service.start(
                UUID.fromString(body.get("userId")),
                body.get("username"),
                body.getOrDefault("description", "")
        );
        messaging.convertAndSend("/topic/time-entries", Map.of("type", "STARTED"));
        return entry;
    }

    @PutMapping("/{id}/stop")
    public TimeEntry stop(@PathVariable UUID id,
                          @RequestBody(required = false) Map<String, Object> body) {
        Long durationSeconds = null;
        if (body != null && body.get("durationSeconds") instanceof Number n) {
            durationSeconds = n.longValue();
        }
        TimeEntry entry = service.stop(id, durationSeconds);
        messaging.convertAndSend("/topic/time-entries", Map.of("type", "STOPPED"));
        return entry;
    }

    @PatchMapping("/{id}")
    public TimeEntry updateDescription(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        return service.updateDescription(id, body.get("description"));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        service.delete(id);
        messaging.convertAndSend("/topic/time-entries", Map.of("type", "DELETED"));
    }
}
