package com.collabcrm.service;

import com.collabcrm.model.TimeEntry;
import com.collabcrm.repository.TimeEntryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional
public class TimeEntryService {

    private final TimeEntryRepository repository;

    public TimeEntryService(TimeEntryRepository repository) {
        this.repository = repository;
    }

    public List<TimeEntry> findAll() {
        return repository.findAllByOrderByStartedAtDesc();
    }

    public Optional<TimeEntry> findActive(UUID userId) {
        return repository.findByUserIdAndStoppedAtIsNull(userId);
    }

    public TimeEntry start(UUID userId, String username, String description) {
        // Stop any existing active entry for this user before starting a new one
        repository.findByUserIdAndStoppedAtIsNull(userId).ifPresent(active -> {
            Instant now = Instant.now();
            active.setStoppedAt(now);
            active.setDurationSeconds(now.getEpochSecond() - active.getStartedAt().getEpochSecond());
            repository.save(active);
        });

        TimeEntry entry = new TimeEntry();
        entry.setUserId(userId);
        entry.setUsername(username);
        entry.setDescription(description);
        return repository.save(entry);
    }

    public TimeEntry stop(UUID id, Long durationSeconds) {
        TimeEntry entry = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("TimeEntry not found: " + id));
        Instant now = Instant.now();
        entry.setStoppedAt(now);
        entry.setDurationSeconds(
                durationSeconds != null
                        ? durationSeconds
                        : now.getEpochSecond() - entry.getStartedAt().getEpochSecond()
        );
        return repository.save(entry);
    }

    public TimeEntry updateDescription(UUID id, String description) {
        TimeEntry entry = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("TimeEntry not found: " + id));
        entry.setDescription(description);
        return repository.save(entry);
    }

    public void delete(UUID id) {
        repository.deleteById(id);
    }

    public List<TimeEntry> startTogether(List<Map<String, String>> participants, String description) {
        UUID groupId = UUID.randomUUID();
        List<TimeEntry> entries = new ArrayList<>();
        for (Map<String, String> p : participants) {
            UUID uid = UUID.fromString(p.get("userId"));
            repository.findByUserIdAndStoppedAtIsNull(uid).ifPresent(active -> {
                Instant now = Instant.now();
                active.setStoppedAt(now);
                active.setDurationSeconds(now.getEpochSecond() - active.getStartedAt().getEpochSecond());
                repository.save(active);
            });
            TimeEntry entry = new TimeEntry();
            entry.setUserId(uid);
            entry.setUsername(p.get("username"));
            entry.setDescription(description);
            entry.setSessionGroupId(groupId);
            entries.add(repository.save(entry));
        }
        return entries;
    }

    public List<TimeEntry> linkTogether(UUID id1, UUID id2) {
        TimeEntry e1 = repository.findById(id1).orElseThrow(() -> new RuntimeException("TimeEntry not found: " + id1));
        TimeEntry e2 = repository.findById(id2).orElseThrow(() -> new RuntimeException("TimeEntry not found: " + id2));
        UUID groupId = e1.getSessionGroupId() != null ? e1.getSessionGroupId()
                : e2.getSessionGroupId() != null ? e2.getSessionGroupId()
                : UUID.randomUUID();
        e1.setSessionGroupId(groupId);
        e2.setSessionGroupId(groupId);
        return List.of(repository.save(e1), repository.save(e2));
    }
}
