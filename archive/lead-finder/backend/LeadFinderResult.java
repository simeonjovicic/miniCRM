package com.collabcrm.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import org.springframework.data.jpa.domain.AbstractPersistable;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(
        name = "lead_finder_results",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_lead_finder_run_place",
                columnNames = {"run_id", "google_place_id"}
        ),
        indexes = {
                @Index(name = "idx_lead_finder_results_run", columnList = "run_id"),
                @Index(name = "idx_lead_finder_results_place", columnList = "google_place_id"),
                @Index(name = "idx_lead_finder_results_district", columnList = "district")
        }
)
public class LeadFinderResult extends AbstractPersistable<UUID> {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "run_id", nullable = false)
    private LeadFinderRun run;

    @Column(name = "google_place_id", nullable = false)
    private String googlePlaceId;

    @Column(nullable = false)
    private String businessName;

    @Column(columnDefinition = "TEXT")
    private String formattedAddress;

    private String phone;

    @Column(columnDefinition = "TEXT")
    private String googleMapsUri;

    @Column(columnDefinition = "TEXT")
    private String websiteUri;

    private String businessStatus;

    private String primaryType;

    @Column(columnDefinition = "TEXT")
    private String types;

    @Column(columnDefinition = "TEXT")
    private String matchedTerms;

    @Column(nullable = false)
    private int reviewCount;

    @Column(nullable = false)
    private String keyword;

    @Column(nullable = false)
    private String city;

    @Column(nullable = false)
    private String district;

    @Column(nullable = false, updatable = false)
    private Instant fetchedAt;

    private Instant snapshotExpiresAt;

    @PrePersist
    void prePersist() {
        if (fetchedAt == null) fetchedAt = Instant.now();
    }

    public LeadFinderRun getRun() { return run; }
    public void setRun(LeadFinderRun run) { this.run = run; }

    public String getGooglePlaceId() { return googlePlaceId; }
    public void setGooglePlaceId(String googlePlaceId) { this.googlePlaceId = googlePlaceId; }

    public String getBusinessName() { return businessName; }
    public void setBusinessName(String businessName) { this.businessName = businessName; }

    public String getFormattedAddress() { return formattedAddress; }
    public void setFormattedAddress(String formattedAddress) { this.formattedAddress = formattedAddress; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getGoogleMapsUri() { return googleMapsUri; }
    public void setGoogleMapsUri(String googleMapsUri) { this.googleMapsUri = googleMapsUri; }

    public String getWebsiteUri() { return websiteUri; }
    public void setWebsiteUri(String websiteUri) { this.websiteUri = websiteUri; }

    public String getBusinessStatus() { return businessStatus; }
    public void setBusinessStatus(String businessStatus) { this.businessStatus = businessStatus; }

    public String getPrimaryType() { return primaryType; }
    public void setPrimaryType(String primaryType) { this.primaryType = primaryType; }

    public String getTypes() { return types; }
    public void setTypes(String types) { this.types = types; }

    public String getMatchedTerms() { return matchedTerms; }
    public void setMatchedTerms(String matchedTerms) { this.matchedTerms = matchedTerms; }

    public int getReviewCount() { return reviewCount; }
    public void setReviewCount(int reviewCount) { this.reviewCount = reviewCount; }

    public String getKeyword() { return keyword; }
    public void setKeyword(String keyword) { this.keyword = keyword; }

    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }

    public String getDistrict() { return district; }
    public void setDistrict(String district) { this.district = district; }

    public Instant getFetchedAt() { return fetchedAt; }
    public void setFetchedAt(Instant fetchedAt) { this.fetchedAt = fetchedAt; }

    public Instant getSnapshotExpiresAt() { return snapshotExpiresAt; }
    public void setSnapshotExpiresAt(Instant snapshotExpiresAt) { this.snapshotExpiresAt = snapshotExpiresAt; }
}
