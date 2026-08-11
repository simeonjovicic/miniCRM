package com.collabcrm.repository;

import com.collabcrm.model.LeadFinderTermCache;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface LeadFinderTermCacheRepository extends JpaRepository<LeadFinderTermCache, UUID> {
    Optional<LeadFinderTermCache> findByNormalizedKeyword(String normalizedKeyword);
}
