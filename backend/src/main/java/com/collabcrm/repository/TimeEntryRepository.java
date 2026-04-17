package com.collabcrm.repository;

import com.collabcrm.model.TimeEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TimeEntryRepository extends JpaRepository<TimeEntry, UUID> {

    List<TimeEntry> findAllByOrderByStartedAtDesc();

    /** Find an active (running) entry for a specific user */
    Optional<TimeEntry> findByUserIdAndStoppedAtIsNull(UUID userId);
}
