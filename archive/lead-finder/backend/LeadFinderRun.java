package com.collabcrm.model;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import org.springframework.data.jpa.domain.AbstractPersistable;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "lead_finder_runs")
public class LeadFinderRun extends AbstractPersistable<UUID> {

    @Column(nullable = false)
    private String keyword;

    @Column(nullable = false)
    private String normalizedKeyword;

    @Column(nullable = false)
    private String city;

    @Column(nullable = false)
    private String normalizedCity;

    @Column(nullable = false)
    private String scope;

    @Column(nullable = false)
    private String status;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "lead_finder_run_terms",
            joinColumns = @JoinColumn(name = "run_id")
    )
    @OrderColumn(name = "term_order")
    @Column(name = "term", nullable = false)
    private List<String> approvedTerms = new ArrayList<>();

    @Column(nullable = false)
    private int totalSearches;

    @Column(nullable = false)
    private int completedSearches;

    @Column(nullable = false)
    private int keptResults;

    @Column(nullable = false)
    private int droppedClosed;

    @Column(nullable = false)
    private int droppedWithWebsite;

    @Column(nullable = false)
    private int duplicateResults;

    @Column(columnDefinition = "TEXT")
    private String errorMessage;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    private Instant startedAt;

    private Instant finishedAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
        if (status == null) status = "PENDING";
    }

    public String getKeyword() { return keyword; }
    public void setKeyword(String keyword) { this.keyword = keyword; }

    public String getNormalizedKeyword() { return normalizedKeyword; }
    public void setNormalizedKeyword(String normalizedKeyword) { this.normalizedKeyword = normalizedKeyword; }

    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }

    public String getNormalizedCity() { return normalizedCity; }
    public void setNormalizedCity(String normalizedCity) { this.normalizedCity = normalizedCity; }

    public String getScope() { return scope; }
    public void setScope(String scope) { this.scope = scope; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public List<String> getApprovedTerms() { return approvedTerms; }
    public void setApprovedTerms(List<String> approvedTerms) { this.approvedTerms = approvedTerms; }

    public int getTotalSearches() { return totalSearches; }
    public void setTotalSearches(int totalSearches) { this.totalSearches = totalSearches; }

    public int getCompletedSearches() { return completedSearches; }
    public void setCompletedSearches(int completedSearches) { this.completedSearches = completedSearches; }

    public int getKeptResults() { return keptResults; }
    public void setKeptResults(int keptResults) { this.keptResults = keptResults; }

    public int getDroppedClosed() { return droppedClosed; }
    public void setDroppedClosed(int droppedClosed) { this.droppedClosed = droppedClosed; }

    public int getDroppedWithWebsite() { return droppedWithWebsite; }
    public void setDroppedWithWebsite(int droppedWithWebsite) { this.droppedWithWebsite = droppedWithWebsite; }

    public int getDuplicateResults() { return duplicateResults; }
    public void setDuplicateResults(int duplicateResults) { this.duplicateResults = duplicateResults; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }

    public Instant getFinishedAt() { return finishedAt; }
    public void setFinishedAt(Instant finishedAt) { this.finishedAt = finishedAt; }
}
