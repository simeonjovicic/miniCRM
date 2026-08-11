package com.collabcrm.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class GooglePlacesClient {

    private static final String SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
    private static final String FIELD_MASK = String.join(",",
            "places.id",
            "places.displayName",
            "places.formattedAddress",
            "places.businessStatus",
            "places.websiteUri",
            "places.types",
            "places.primaryType",
            "places.googleMapsUri",
            "places.nationalPhoneNumber",
            "places.userRatingCount",
            "nextPageToken"
    );

    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${google.places.api-key:}")
    private String apiKey;

    @Value("${google.places.max-pages-per-search:1}")
    private int maxPagesPerSearch;

    public List<PlaceCandidate> searchText(String textQuery) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("GOOGLE_PLACES_API_KEY fehlt.");
        }

        List<PlaceCandidate> candidates = new ArrayList<>();
        String pageToken = null;
        int pages = Math.max(1, maxPagesPerSearch);

        for (int page = 0; page < pages; page++) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("textQuery", textQuery);
            body.put("languageCode", "de");
            body.put("regionCode", "AT");
            body.put("pageSize", 20);
            if (pageToken != null) {
                body.put("pageToken", pageToken);
            }

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Goog-Api-Key", apiKey);
            headers.set("X-Goog-FieldMask", FIELD_MASK);

            @SuppressWarnings("unchecked")
            ResponseEntity<Map> response = restTemplate.exchange(
                    SEARCH_URL,
                    HttpMethod.POST,
                    new HttpEntity<>(body, headers),
                    Map.class
            );

            Map<String, Object> responseBody = response.getBody();
            candidates.addAll(readPlaces(responseBody));
            pageToken = stringValue(responseBody, "nextPageToken");
            if (pageToken == null || pageToken.isBlank()) {
                break;
            }
        }

        return candidates;
    }

    @SuppressWarnings("unchecked")
    private List<PlaceCandidate> readPlaces(Map<String, Object> responseBody) {
        if (responseBody == null || !(responseBody.get("places") instanceof List<?> places)) {
            return List.of();
        }

        List<PlaceCandidate> result = new ArrayList<>();
        for (Object value : places) {
            if (!(value instanceof Map<?, ?> rawPlace)) continue;
            Map<String, Object> place = (Map<String, Object>) rawPlace;
            Map<String, Object> displayName = mapValue(place, "displayName");
            List<String> types = listValue(place, "types");

            result.add(new PlaceCandidate(
                    stringValue(place, "id"),
                    stringValue(displayName, "text"),
                    stringValue(place, "formattedAddress"),
                    stringValue(place, "nationalPhoneNumber"),
                    stringValue(place, "googleMapsUri"),
                    stringValue(place, "websiteUri"),
                    stringValue(place, "businessStatus"),
                    stringValue(place, "primaryType"),
                    types,
                    intValue(place, "userRatingCount")
            ));
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> mapValue(Map<String, Object> map, String key) {
        Object value = map == null ? null : map.get(key);
        if (value instanceof Map<?, ?> raw) {
            return (Map<String, Object>) raw;
        }
        return Collections.emptyMap();
    }

    private List<String> listValue(Map<String, Object> map, String key) {
        Object value = map == null ? null : map.get(key);
        if (!(value instanceof List<?> rawList)) {
            return List.of();
        }
        List<String> values = new ArrayList<>();
        for (Object item : rawList) {
            if (item != null) values.add(String.valueOf(item));
        }
        return values;
    }

    private String stringValue(Map<String, Object> map, String key) {
        Object value = map == null ? null : map.get(key);
        if (value == null) return null;
        String text = String.valueOf(value).trim();
        return text.isBlank() ? null : text;
    }

    private int intValue(Map<String, Object> map, String key) {
        Object value = map == null ? null : map.get(key);
        if (value instanceof Number number) return number.intValue();
        if (value == null) return 0;
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    public record PlaceCandidate(
            String placeId,
            String name,
            String formattedAddress,
            String phone,
            String googleMapsUri,
            String websiteUri,
            String businessStatus,
            String primaryType,
            List<String> types,
            int reviewCount
    ) {}
}
