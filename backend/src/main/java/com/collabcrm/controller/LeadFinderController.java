package com.collabcrm.controller;

import com.collabcrm.service.LeadFinderService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/lead-finder")
public class LeadFinderController {

    private final LeadFinderService leadFinderService;

    public LeadFinderController(LeadFinderService leadFinderService) {
        this.leadFinderService = leadFinderService;
    }

    @PostMapping("/terms")
    public LeadFinderService.TermExpansion terms(@RequestBody TermRequest request) {
        try {
            return leadFinderService.getTerms(request.keyword());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
    }

    @PostMapping("/runs")
    @ResponseStatus(HttpStatus.CREATED)
    public LeadFinderService.RunView startRun(@RequestBody RunRequest request) {
        try {
            return leadFinderService.startRun(request.keyword(), request.city(), request.terms());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
    }

    @GetMapping("/runs")
    public List<LeadFinderService.RunSummary> recentRuns() {
        return leadFinderService.recentRuns();
    }

    @GetMapping("/runs/{id}")
    public LeadFinderService.RunView getRun(@PathVariable UUID id) {
        return leadFinderService.getRun(id);
    }

    public record TermRequest(String keyword) {}

    public record RunRequest(String keyword, String city, List<String> terms) {}
}
