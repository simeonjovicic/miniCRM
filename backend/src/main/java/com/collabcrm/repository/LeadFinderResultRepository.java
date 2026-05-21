package com.collabcrm.repository;

import com.collabcrm.model.LeadFinderResult;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface LeadFinderResultRepository extends JpaRepository<LeadFinderResult, UUID> {
    List<LeadFinderResult> findByRun_IdOrderByDistrictAscReviewCountDesc(UUID runId);
}
