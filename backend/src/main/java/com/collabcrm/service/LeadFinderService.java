package com.collabcrm.service;

import com.collabcrm.model.LeadFinderResult;
import com.collabcrm.model.LeadFinderRun;
import com.collabcrm.model.LeadFinderTermCache;
import com.collabcrm.repository.LeadFinderResultRepository;
import com.collabcrm.repository.LeadFinderRunRepository;
import com.collabcrm.repository.LeadFinderTermCacheRepository;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.text.Normalizer;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Service
public class LeadFinderService {

    private static final Set<String> EXCLUDED_PLACE_TYPES = Set.of(
            "airport",
            "apartment_building",
            "bus_station",
            "campground",
            "church",
            "city_hall",
            "embassy",
            "fire_station",
            "government_office",
            "hiking_area",
            "historical_landmark",
            "hostel",
            "hotel",
            "library",
            "local_government_office",
            "lodging",
            "museum",
            "park",
            "parking",
            "playground",
            "police",
            "rv_park",
            "school",
            "subway_station",
            "tourist_attraction",
            "train_station",
            "transit_station",
            "university",
            "zoo"
    );

    private static final List<SearchArea> VIENNA_DISTRICTS = List.of(
            new SearchArea("1. Innere Stadt", "Innere Stadt, Wien"),
            new SearchArea("2. Leopoldstadt", "Leopoldstadt, Wien"),
            new SearchArea("3. Landstraße", "Landstraße, Wien"),
            new SearchArea("4. Wieden", "Wieden, Wien"),
            new SearchArea("5. Margareten", "Margareten, Wien"),
            new SearchArea("6. Mariahilf", "Mariahilf, Wien"),
            new SearchArea("7. Neubau", "Neubau, Wien"),
            new SearchArea("8. Josefstadt", "Josefstadt, Wien"),
            new SearchArea("9. Alsergrund", "Alsergrund, Wien"),
            new SearchArea("10. Favoriten", "Favoriten, Wien"),
            new SearchArea("11. Simmering", "Simmering, Wien"),
            new SearchArea("12. Meidling", "Meidling, Wien"),
            new SearchArea("13. Hietzing", "Hietzing, Wien"),
            new SearchArea("14. Penzing", "Penzing, Wien"),
            new SearchArea("15. Rudolfsheim-Fünfhaus", "Rudolfsheim-Fünfhaus, Wien"),
            new SearchArea("16. Ottakring", "Ottakring, Wien"),
            new SearchArea("17. Hernals", "Hernals, Wien"),
            new SearchArea("18. Währing", "Währing, Wien"),
            new SearchArea("19. Döbling", "Döbling, Wien"),
            new SearchArea("20. Brigittenau", "Brigittenau, Wien"),
            new SearchArea("21. Floridsdorf", "Floridsdorf, Wien"),
            new SearchArea("22. Donaustadt", "Donaustadt, Wien"),
            new SearchArea("23. Liesing", "Liesing, Wien")
    );

    private final LeadFinderAiService aiService;
    private final GooglePlacesClient placesClient;
    private final LeadFinderTermCacheRepository termCacheRepository;
    private final LeadFinderRunRepository runRepository;
    private final LeadFinderResultRepository resultRepository;
    private final ExecutorService executor = Executors.newFixedThreadPool(2, runnable -> {
        Thread thread = new Thread(runnable, "lead-finder-worker");
        thread.setDaemon(true);
        return thread;
    });

    public LeadFinderService(LeadFinderAiService aiService,
                             GooglePlacesClient placesClient,
                             LeadFinderTermCacheRepository termCacheRepository,
                             LeadFinderRunRepository runRepository,
                             LeadFinderResultRepository resultRepository) {
        this.aiService = aiService;
        this.placesClient = placesClient;
        this.termCacheRepository = termCacheRepository;
        this.runRepository = runRepository;
        this.resultRepository = resultRepository;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void resumePendingRuns() {
        runRepository.findByStatusOrderByCreatedAtAsc("PENDING")
                .forEach(run -> executor.submit(() -> executeRun(run.getId())));
    }

    @Transactional(readOnly = true)
    public TermExpansion getTerms(String keyword) {
        String cleanKeyword = requireText(keyword, "Keyword");
        String normalized = normalize(cleanKeyword);
        return termCacheRepository.findByNormalizedKeyword(normalized)
                .map(cache -> new TermExpansion(cache.getKeyword(), List.copyOf(cache.getTerms()), true))
                .orElseGet(() -> new TermExpansion(cleanKeyword, sanitizeTerms(cleanKeyword, aiService.expandKeyword(cleanKeyword)), false));
    }

    @Transactional
    public RunView startRun(String keyword, String city, List<String> approvedTerms) {
        String cleanKeyword = requireText(keyword, "Keyword");
        String cleanCity = requireText(city, "City");
        List<String> terms = sanitizeTerms(cleanKeyword, approvedTerms);
        List<SearchArea> areas = searchAreas(cleanCity);

        upsertTermCache(cleanKeyword, terms);

        LeadFinderRun run = new LeadFinderRun();
        run.setKeyword(cleanKeyword);
        run.setNormalizedKeyword(normalize(cleanKeyword));
        run.setCity(cleanCity);
        run.setNormalizedCity(normalize(cleanCity));
        run.setScope(scopeForCity(cleanCity));
        run.setStatus("PENDING");
        run.setApprovedTerms(new ArrayList<>(terms));
        run.setTotalSearches(terms.size() * areas.size());
        run.setCompletedSearches(0);
        run.setKeptResults(0);
        run.setDroppedClosed(0);
        run.setDroppedWithWebsite(0);
        run.setDuplicateResults(0);
        LeadFinderRun saved = runRepository.save(run);

        UUID runId = saved.getId();
        runAfterCommit(() -> executor.submit(() -> executeRun(runId)));
        return toRunView(saved, List.of());
    }

    @Transactional(readOnly = true)
    public RunView getRun(UUID id) {
        LeadFinderRun run = findRun(id);
        List<LeadFinderResult> results = resultRepository.findByRun_IdOrderByDistrictAscReviewCountDesc(id);
        return toRunView(run, results);
    }

    @Transactional(readOnly = true)
    public List<RunSummary> recentRuns() {
        return runRepository.findTop20ByOrderByCreatedAtDesc()
                .stream()
                .map(run -> new RunSummary(
                        run.getId(),
                        run.getKeyword(),
                        run.getCity(),
                        run.getScope(),
                        run.getStatus(),
                        run.getKeptResults(),
                        run.getCompletedSearches(),
                        run.getTotalSearches(),
                        run.getCreatedAt(),
                        run.getFinishedAt()
                ))
                .toList();
    }

    private void executeRun(UUID runId) {
        LeadFinderRun run = findRun(runId);
        try {
            run.setStatus("RUNNING");
            run.setStartedAt(Instant.now());
            runRepository.save(run);

            Map<String, CandidateAccumulator> candidatesByPlace = new LinkedHashMap<>();
            List<SearchArea> areas = searchAreas(run.getCity());
            int completed = 0;
            int droppedClosed = 0;
            int droppedWithWebsite = 0;
            int duplicates = 0;

            for (SearchArea area : areas) {
                for (String term : run.getApprovedTerms()) {
                    String query = term + " in " + area.queryLocation();
                    List<GooglePlacesClient.PlaceCandidate> candidates = placesClient.searchText(query);

                    for (GooglePlacesClient.PlaceCandidate candidate : candidates) {
                        if (candidate.placeId() == null || candidate.placeId().isBlank()) {
                            continue;
                        }
                        if ("CLOSED_PERMANENTLY".equals(candidate.businessStatus())) {
                            droppedClosed++;
                            continue;
                        }
                        if (isExcludedCandidate(candidate)) {
                            continue;
                        }
                        if (hasText(candidate.websiteUri())) {
                            droppedWithWebsite++;
                            continue;
                        }

                        CandidateAccumulator existing = candidatesByPlace.get(candidate.placeId());
                        if (existing != null) {
                            duplicates++;
                            existing.terms.add(term);
                            continue;
                        }

                        CandidateAccumulator accumulator = new CandidateAccumulator(candidate, area.label());
                        accumulator.terms.add(term);
                        candidatesByPlace.put(candidate.placeId(), accumulator);
                    }

                    completed++;
                    run.setCompletedSearches(completed);
                    run.setKeptResults(candidatesByPlace.size());
                    run.setDroppedClosed(droppedClosed);
                    run.setDroppedWithWebsite(droppedWithWebsite);
                    run.setDuplicateResults(duplicates);
                    runRepository.save(run);
                }
            }

            List<LeadFinderResult> results = candidatesByPlace.values()
                    .stream()
                    .sorted(Comparator
                            .comparing(CandidateAccumulator::district)
                            .thenComparing((CandidateAccumulator acc) -> acc.place.reviewCount()).reversed())
                    .map(acc -> toResult(run, acc))
                    .toList();
            resultRepository.saveAll(results);

            run.setStatus("COMPLETED");
            run.setFinishedAt(Instant.now());
            run.setKeptResults(results.size());
            run.setDroppedClosed(droppedClosed);
            run.setDroppedWithWebsite(droppedWithWebsite);
            run.setDuplicateResults(duplicates);
            runRepository.save(run);
        } catch (Exception e) {
            run.setStatus("FAILED");
            run.setErrorMessage(e.getMessage());
            run.setFinishedAt(Instant.now());
            runRepository.save(run);
        }
    }

    private LeadFinderResult toResult(LeadFinderRun run, CandidateAccumulator acc) {
        GooglePlacesClient.PlaceCandidate place = acc.place;
        LeadFinderResult result = new LeadFinderResult();
        result.setRun(run);
        result.setGooglePlaceId(place.placeId());
        result.setBusinessName(hasText(place.name()) ? place.name() : "Unbenannter Betrieb");
        result.setFormattedAddress(place.formattedAddress());
        result.setPhone(place.phone());
        result.setGoogleMapsUri(place.googleMapsUri());
        result.setWebsiteUri(place.websiteUri());
        result.setBusinessStatus(place.businessStatus());
        result.setPrimaryType(place.primaryType());
        result.setTypes(String.join(", ", place.types()));
        result.setMatchedTerms(String.join(", ", acc.terms));
        result.setReviewCount(place.reviewCount());
        result.setKeyword(run.getKeyword());
        result.setCity(run.getCity());
        result.setDistrict(acc.district);
        result.setFetchedAt(Instant.now());
        result.setSnapshotExpiresAt(Instant.now().plus(Duration.ofDays(30)));
        return result;
    }

    private RunView toRunView(LeadFinderRun run, List<LeadFinderResult> results) {
        int progressPercent = run.getTotalSearches() == 0
                ? 0
                : (int) Math.round((run.getCompletedSearches() * 100.0) / run.getTotalSearches());

        return new RunView(
                run.getId(),
                run.getKeyword(),
                run.getCity(),
                run.getScope(),
                run.getStatus(),
                List.copyOf(run.getApprovedTerms()),
                run.getTotalSearches(),
                run.getCompletedSearches(),
                Math.min(progressPercent, 100),
                run.getKeptResults(),
                run.getDroppedClosed(),
                run.getDroppedWithWebsite(),
                run.getDuplicateResults(),
                run.getErrorMessage(),
                run.getCreatedAt(),
                run.getStartedAt(),
                run.getFinishedAt(),
                results.stream().map(this::toResultView).toList()
        );
    }

    private ResultView toResultView(LeadFinderResult result) {
        return new ResultView(
                result.getId(),
                result.getGooglePlaceId(),
                result.getBusinessName(),
                result.getFormattedAddress(),
                result.getPhone(),
                result.getGoogleMapsUri(),
                result.getBusinessStatus(),
                result.getPrimaryType(),
                result.getTypes(),
                result.getMatchedTerms(),
                result.getReviewCount(),
                result.getCity(),
                result.getDistrict(),
                result.getFetchedAt(),
                result.getSnapshotExpiresAt()
        );
    }

    private void upsertTermCache(String keyword, List<String> terms) {
        String normalized = normalize(keyword);
        LeadFinderTermCache cache = termCacheRepository.findByNormalizedKeyword(normalized)
                .orElseGet(LeadFinderTermCache::new);
        cache.setKeyword(keyword);
        cache.setNormalizedKeyword(normalized);
        cache.setTerms(new ArrayList<>(terms));
        termCacheRepository.save(cache);
    }

    private LeadFinderRun findRun(UUID id) {
        return runRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Lead-Finder-Run nicht gefunden: " + id));
    }

    private List<SearchArea> searchAreas(String city) {
        if ("wien".equals(normalize(city)) || "vienna".equals(normalize(city))) {
            return VIENNA_DISTRICTS;
        }
        return List.of(new SearchArea(city, city));
    }

    private String scopeForCity(String city) {
        String normalized = normalize(city);
        if ("wien".equals(normalized) || "vienna".equals(normalized)) {
            return "VIENNA_DISTRICTS";
        }
        if ("osterreich".equals(normalized) || "austria".equals(normalized)) {
            return "AUSTRIA";
        }
        return "CITY";
    }

    private List<String> sanitizeTerms(String keyword, List<String> terms) {
        Map<String, String> unique = new LinkedHashMap<>();
        putTerm(unique, keyword);
        if (terms != null) {
            for (String term : terms) {
                putTerm(unique, term);
                if (unique.size() >= 25) break;
            }
        }
        return new ArrayList<>(unique.values());
    }

    private void putTerm(Map<String, String> unique, String raw) {
        if (raw == null) return;
        String term = raw.trim();
        if (term.isBlank()) return;
        unique.putIfAbsent(normalize(term), term);
    }

    private String requireText(String value, String label) {
        if (value == null || value.trim().isBlank()) {
            throw new IllegalArgumentException(label + " darf nicht leer sein.");
        }
        return value.trim();
    }

    private String normalize(String value) {
        String normalized = Normalizer.normalize(value == null ? "" : value.trim(), Normalizer.Form.NFD);
        return normalized
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", " ");
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private boolean isExcludedCandidate(GooglePlacesClient.PlaceCandidate candidate) {
        if (candidate.primaryType() != null && EXCLUDED_PLACE_TYPES.contains(candidate.primaryType())) {
            return true;
        }
        return candidate.types().stream().anyMatch(EXCLUDED_PLACE_TYPES::contains);
    }

    private void runAfterCommit(Runnable runnable) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            runnable.run();
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                runnable.run();
            }
        });
    }

    private record SearchArea(String label, String queryLocation) {}

    private static final class CandidateAccumulator {
        private final GooglePlacesClient.PlaceCandidate place;
        private final String district;
        private final Set<String> terms = new LinkedHashSet<>();

        private CandidateAccumulator(GooglePlacesClient.PlaceCandidate place, String district) {
            this.place = place;
            this.district = district;
        }

        private String district() {
            return district;
        }
    }

    public record TermExpansion(String keyword, List<String> terms, boolean cached) {}

    public record RunSummary(
            UUID id,
            String keyword,
            String city,
            String scope,
            String status,
            int keptResults,
            int completedSearches,
            int totalSearches,
            Instant createdAt,
            Instant finishedAt
    ) {}

    public record RunView(
            UUID id,
            String keyword,
            String city,
            String scope,
            String status,
            List<String> approvedTerms,
            int totalSearches,
            int completedSearches,
            int progressPercent,
            int keptResults,
            int droppedClosed,
            int droppedWithWebsite,
            int duplicateResults,
            String errorMessage,
            Instant createdAt,
            Instant startedAt,
            Instant finishedAt,
            List<ResultView> results
    ) {}

    public record ResultView(
            UUID id,
            String googlePlaceId,
            String businessName,
            String formattedAddress,
            String phone,
            String googleMapsUri,
            String businessStatus,
            String primaryType,
            String types,
            String matchedTerms,
            int reviewCount,
            String city,
            String district,
            Instant fetchedAt,
            Instant snapshotExpiresAt
    ) {}
}
