package com.collabcrm.model;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import org.springframework.data.jpa.domain.AbstractPersistable;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(
        name = "lead_finder_term_cache",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_lead_finder_term_keyword",
                columnNames = "normalized_keyword"
        )
)
public class LeadFinderTermCache extends AbstractPersistable<UUID> {

    @Column(nullable = false)
    private String keyword;

    @Column(name = "normalized_keyword", nullable = false)
    private String normalizedKeyword;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "lead_finder_term_cache_terms",
            joinColumns = @JoinColumn(name = "term_cache_id")
    )
    @OrderColumn(name = "term_order")
    @Column(name = "term", nullable = false)
    private List<String> terms = new ArrayList<>();

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    @PrePersist
    void prePersist() {
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
    }

    public String getKeyword() { return keyword; }
    public void setKeyword(String keyword) { this.keyword = keyword; }

    public String getNormalizedKeyword() { return normalizedKeyword; }
    public void setNormalizedKeyword(String normalizedKeyword) { this.normalizedKeyword = normalizedKeyword; }

    public List<String> getTerms() { return terms; }
    public void setTerms(List<String> terms) { this.terms = terms; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
