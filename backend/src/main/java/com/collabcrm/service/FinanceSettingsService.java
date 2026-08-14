package com.collabcrm.service;

import com.collabcrm.model.ExternalRevenue;
import com.collabcrm.model.FinanceSettings;
import com.collabcrm.repository.ExternalRevenueRepository;
import com.collabcrm.repository.FinanceSettingsRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Liefert die Finanz-Einstellungen eines Jahres und legt sie beim ersten Zugriff
 * aus den Vorgabewerten an.
 *
 * Die Vorgaben in application.yml sind bewusst nur Startwerte. Grenzbeträge ändern
 * sich jährlich, deshalb werden sie pro Jahr gespeichert und in der Oberfläche
 * gepflegt statt im Code festgeschrieben.
 */
@Service
@Transactional
public class FinanceSettingsService {

    public static final String SPLIT_GROSS = "GROSS";
    public static final String SPLIT_NET = "NET";

    private final FinanceSettingsRepository repository;
    private final ExternalRevenueRepository externalRepository;

    private final BigDecimal defaultSvsThreshold;
    private final BigDecimal defaultSmallBusinessThreshold;
    private final String defaultSplitBasis;

    public FinanceSettingsService(
            FinanceSettingsRepository repository,
            ExternalRevenueRepository externalRepository,
            @Value("${finance.thresholds.svs}") BigDecimal defaultSvsThreshold,
            @Value("${finance.thresholds.small-business}") BigDecimal defaultSmallBusinessThreshold,
            @Value("${finance.split-basis}") String defaultSplitBasis) {
        this.repository = repository;
        this.externalRepository = externalRepository;
        this.defaultSvsThreshold = defaultSvsThreshold;
        this.defaultSmallBusinessThreshold = defaultSmallBusinessThreshold;
        this.defaultSplitBasis = defaultSplitBasis;
    }

    public FinanceSettings forYear(int year) {
        return repository.findById(year).orElseGet(() -> repository.save(
                new FinanceSettings(year, defaultSvsThreshold, defaultSmallBusinessThreshold, defaultSplitBasis)));
    }

    public FinanceSettings update(int year, FinanceSettings data) {
        FinanceSettings settings = forYear(year);
        if (data.getSvsThreshold() != null) {
            settings.setSvsThreshold(data.getSvsThreshold());
        }
        if (data.getSmallBusinessThreshold() != null) {
            settings.setSmallBusinessThreshold(data.getSmallBusinessThreshold());
        }
        if (data.getSplitBasis() != null) {
            if (!SPLIT_GROSS.equals(data.getSplitBasis()) && !SPLIT_NET.equals(data.getSplitBasis())) {
                throw new IllegalArgumentException("splitBasis muss GROSS oder NET sein.");
            }
            settings.setSplitBasis(data.getSplitBasis());
        }
        return repository.save(settings);
    }

    /* ── Umsatz ausserhalb dieses CRM ─────────────────────────────── */

    public List<ExternalRevenue> externalRevenue(int year) {
        return externalRepository.findByYear(year);
    }

    /**
     * Setzt den Nebenumsatz einer Person. Ein Betrag von 0 oder null loescht den
     * Eintrag wieder, damit keine Karteileichen mit 0,00 stehen bleiben.
     */
    public ExternalRevenue setExternalRevenue(int year, UUID userId, String username,
                                              BigDecimal amount, String note) {
        var existing = externalRepository.findByYearAndUserId(year, userId).orElse(null);

        if (amount == null || amount.signum() <= 0) {
            if (existing != null) externalRepository.delete(existing);
            return null;
        }
        if (existing == null) {
            return externalRepository.save(new ExternalRevenue(year, userId, username, amount, note));
        }
        existing.setAmount(amount);
        existing.setNote(note);
        if (username != null) existing.setUsername(username);
        return externalRepository.save(existing);
    }
}
