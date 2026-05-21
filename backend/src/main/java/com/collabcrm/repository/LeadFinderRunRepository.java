package com.collabcrm.repository;

import com.collabcrm.model.LeadFinderRun;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface LeadFinderRunRepository extends JpaRepository<LeadFinderRun, UUID> {
    List<LeadFinderRun> findTop20ByOrderByCreatedAtDesc();
    List<LeadFinderRun> findByStatusOrderByCreatedAtAsc(String status);
}
