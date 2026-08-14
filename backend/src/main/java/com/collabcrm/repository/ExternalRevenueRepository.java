package com.collabcrm.repository;

import com.collabcrm.model.ExternalRevenue;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ExternalRevenueRepository extends JpaRepository<ExternalRevenue, UUID> {

    List<ExternalRevenue> findByYear(int year);

    Optional<ExternalRevenue> findByYearAndUserId(int year, UUID userId);
}
