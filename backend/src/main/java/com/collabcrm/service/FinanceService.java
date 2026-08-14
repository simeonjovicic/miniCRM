package com.collabcrm.service;

import com.collabcrm.model.FinanceEntry;
import com.collabcrm.repository.FinanceEntryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Service für Finanzeinträge.
 *
 * Zentral hier: {@link #normalize} füllt aus dem eingetippten Betrag, dem
 * Eingabemodus und dem USt-Satz die drei Betragsfelder und setzt fehlende
 * Vorgaben. Dadurch kann kein Eintrag halb befüllt in der Datenbank landen,
 * egal ob er über das Formular oder direkt per API kommt.
 */
@Service
@Transactional
public class FinanceService {

    private static final Logger log = LoggerFactory.getLogger(FinanceService.class);

    public static final String TYPE_INCOME = "INCOME";
    public static final String TYPE_EXPENSE = "EXPENSE";

    public static final String KIND_INVOICE = "INVOICE";
    public static final String KIND_DEPOSIT = "DEPOSIT";

    /** Nur noch für Altdaten — die Oberfläche kennt Entwürfe nicht mehr. */
    public static final String STATUS_DRAFT = "DRAFT";
    public static final String STATUS_SENT = "SENT";
    public static final String STATUS_PAID = "PAID";

    /** Volle Kundenrechnung beim Ersteller */
    public static final String SPLIT_ORIGIN = "ORIGIN";
    /** Anteilsrechnung des Partners — dessen Einnahme */
    public static final String SPLIT_SHARE_IN = "SHARE_IN";
    /** Dieselbe Anteilsrechnung als Aufwand beim Ersteller */
    public static final String SPLIT_SHARE_OUT = "SHARE_OUT";
    /**
     * Haelfte einer geteilten AUSGABE. Anders als SHARE_IN/SHARE_OUT ist das
     * keine interne Verrechnung, sondern echter Aufwand bei beiden — beide
     * Haelften zaehlen deshalb ganz normal in die Jahressumme.
     */
    public static final String SPLIT_HALF = "HALF";

    private static final BigDecimal TWO = new BigDecimal("2");

    private final FinanceEntryRepository repository;

    public FinanceService(FinanceEntryRepository repository) {
        this.repository = repository;
    }

    /** Sortiert nach Datum und Erstellungszeitpunkt absteigend (neueste zuerst). */
    public List<FinanceEntry> findAll() {
        return repository.findAllByOrderByDateDescCreatedAtDesc();
    }

    /** Alle Einträge eines Kalenderjahres. */
    public List<FinanceEntry> findByYear(int year) {
        return repository.findByDateBetweenOrderByDateDescCreatedAtDesc(
                LocalDate.of(year, 1, 1), LocalDate.of(year, 12, 31));
    }

    /**
     * Legt einen Eintrag an. Ist ein Partner angegeben, entstehen ZWEI Buchungen
     * über je den halben Betrag — eine pro Person.
     *
     * Zurückgegeben wird die Buchung des Erstellers.
     */
    public FinanceEntry create(FinanceEntry entry) {
        UUID partnerId = entry.getSharedWithUserId();
        String partnerName = entry.getSharedWithUsername();

        // Die Partnerangabe ist eine Anweisung zum Aufteilen, keine Eigenschaft
        // des Eintrags — gespeichert wird sie deshalb nie.
        entry.setSharedWithUserId(null);
        entry.setSharedWithUsername(null);

        normalize(entry);
        validate(entry);

        if (partnerId == null) {
            return repository.save(entry);
        }
        return TYPE_INCOME.equals(entry.getType())
                ? splitWithPartner(entry, partnerId, partnerName)
                : splitExpense(entry, partnerId, partnerName);
    }

    public FinanceEntry update(UUID id, FinanceEntry data) {
        FinanceEntry entry = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("FinanceEntry not found: " + id));

        UUID partnerId = data.getSharedWithUserId();
        String partnerName = data.getSharedWithUsername();

        if (data.getAmount() != null) entry.setAmount(data.getAmount());
        if (data.getType() != null) entry.setType(data.getType());
        if (data.getDescription() != null) entry.setDescription(data.getDescription());
        if (data.getDate() != null) entry.setDate(data.getDate());
        if (data.getVatRate() != null) entry.setVatRate(data.getVatRate());
        if (data.getInputMode() != null) entry.setInputMode(data.getInputMode());
        if (data.getVatDeductible() != null) entry.setVatDeductible(data.getVatDeductible());
        if (data.getKind() != null) entry.setKind(data.getKind());
        if (data.getStatus() != null) entry.setStatus(data.getStatus());

        // Verknüpfungen müssen auch entfernbar sein, deshalb werden sie immer
        // übernommen — auch wenn im Update null steht.
        entry.setParentId(data.getParentId());
        entry.setCustomerId(data.getCustomerId());
        entry.setCustomerName(data.getCustomerName());
        entry.setAttachmentPath(data.getAttachmentPath());
        entry.setAttachmentName(data.getAttachmentName());

        normalize(entry);
        validate(entry);

        // Nachträglich teilen: nur, wenn der Eintrag noch keine Hälfte ist.
        if (partnerId != null && !entry.isSplitHalf()) {
            return TYPE_INCOME.equals(entry.getType())
                    ? splitWithPartner(entry, partnerId, partnerName)
                    : splitExpense(entry, partnerId, partnerName);
        }
        return repository.save(entry);
    }

    /**
     * Ändert nur Status und Art einer Buchung — für das direkte Umschalten in
     * der Liste.
     *
     * Bewusst getrennt vom normalen Update: dort werden Kunde, Rechnungsanhang
     * und Anzahlungs-Verknüpfung immer mit übernommen, damit man sie entfernen
     * kann. Ein Teil-Update über denselben Weg würde sie also stillschweigend
     * löschen.
     */
    public FinanceEntry updateStatus(UUID id, String status, String kind) {
        FinanceEntry entry = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("FinanceEntry not found: " + id));

        if (status != null) {
            if (!STATUS_DRAFT.equals(status) && !STATUS_SENT.equals(status) && !STATUS_PAID.equals(status)) {
                throw new IllegalArgumentException("Unbekannter Status: " + status);
            }
            entry.setStatus(status);
        }

        if (kind != null) {
            if (!KIND_INVOICE.equals(kind) && !KIND_DEPOSIT.equals(kind)) {
                throw new IllegalArgumentException("Unbekannte Art: " + kind);
            }
            // Eine Rechnung hängt an keiner anderen Rechnung — beim Zurückwandeln
            // muss die Verknüpfung weg, sonst schlägt die Prüfung fehl.
            if (KIND_INVOICE.equals(kind)) {
                entry.setParentId(null);
            }
            entry.setKind(kind);
        }

        validate(entry);
        return repository.save(entry);
    }

    /**
     * Bildet eine geteilte Einnahme so ab, wie sie zwischen zwei
     * Einzelunternehmern tatsächlich abläuft — als DREI Buchungen:
     *
     * <pre>
     *   Kundenrechnung 1.200 (1.000 + 200 USt), 50/50 mit bob
     *
     *   1. admin  Einnahme  1.200  → USt-Schuld 200      (ORIGIN, bleibt voll)
     *   2. bob    Einnahme    600  → USt-Schuld 100      (SHARE_IN)
     *   3. admin  Ausgabe     600  → Vorsteuer   100     (SHARE_OUT)
     *
     *   admin: Gewinn 500, Zahllast 100 | bob: Gewinn 500, Zahllast 100
     * </pre>
     *
     * Der Ersteller hat die volle Leistung fakturiert und schuldet die volle USt.
     * Der Partner stellt ihm seinen Anteil in Rechnung, schuldet darauf selbst
     * USt, und der Ersteller zieht genau diesen Betrag als Vorsteuer ab.
     *
     * Nur so stimmen Umsatz und Vorsteuer je Person — und der Umsatz ist die
     * Bemessungsgrundlage für die Kleinunternehmergrenze.
     *
     * Die interne Anteilsrechnung ist zunächst offen: sie ist gestellt, aber noch
     * nicht beglichen. Beim Partner taucht sie deshalb unter den offenen Posten auf.
     */
    /**
     * Teilt eine AUSGABE hälftig auf beide.
     *
     * Anders als bei Einnahmen entsteht keine interne Verrechnung: der Betrag
     * wird schlicht halbiert und jede Person bucht ihre Hälfte selbst. Damit
     * sinkt der Gewinn bei beiden um dasselbe, ohne dass Umsatz oder offene
     * Posten davon berührt werden.
     *
     * Der Rest-Cent bleibt beim Ersteller, damit die beiden Hälften auch bei
     * ungeraden Beträgen exakt die Summe ergeben.
     */
    private FinanceEntry splitExpense(FinanceEntry origin, UUID partnerId, String partnerName) {
        if (partnerId.equals(origin.getCreatedBy())) {
            throw new IllegalArgumentException("Ein Eintrag kann nicht mit dem Ersteller selbst geteilt werden.");
        }

        BigDecimal full = origin.getAmount();
        BigDecimal partnerShare = full.divide(TWO, 2, RoundingMode.HALF_UP);
        BigDecimal ownShare = full.subtract(partnerShare);
        UUID group = origin.getSplitGroupId() != null ? origin.getSplitGroupId() : UUID.randomUUID();
        String ownerName = origin.getCreatedByUsername();

        FinanceEntry partnerHalf = new FinanceEntry();
        partnerHalf.setType(TYPE_EXPENSE);
        partnerHalf.setKind(origin.getKind());
        partnerHalf.setStatus(origin.getStatus());
        partnerHalf.setDescription(origin.getDescription());
        partnerHalf.setDate(origin.getDate());
        partnerHalf.setVatRate(origin.getVatRate());
        partnerHalf.setInputMode(VatCalculator.MODE_GROSS);
        partnerHalf.setAmount(partnerShare);
        partnerHalf.setVatDeductible(origin.getVatDeductible());
        partnerHalf.setCustomerId(origin.getCustomerId());
        partnerHalf.setCustomerName(origin.getCustomerName());
        partnerHalf.setCreatedBy(partnerId);
        partnerHalf.setCreatedByUsername(partnerName);
        partnerHalf.setSplitGroupId(group);
        partnerHalf.setSplitRole(SPLIT_HALF);
        partnerHalf.setSplitPartnerUsername(ownerName);
        normalize(partnerHalf);
        repository.save(partnerHalf);

        // Die eigene Buchung schrumpft auf die andere Hälfte.
        origin.setInputMode(VatCalculator.MODE_GROSS);
        origin.setAmount(ownShare);
        origin.setSplitGroupId(group);
        origin.setSplitRole(SPLIT_HALF);
        origin.setSplitPartnerUsername(partnerName);
        normalize(origin);

        return repository.save(origin);
    }

    private FinanceEntry splitWithPartner(FinanceEntry origin, UUID partnerId, String partnerName) {
        if (!TYPE_INCOME.equals(origin.getType())) {
            throw new IllegalArgumentException("Nur Einnahmen können geteilt werden.");
        }
        if (partnerId.equals(origin.getCreatedBy())) {
            throw new IllegalArgumentException("Ein Eintrag kann nicht mit dem Ersteller selbst geteilt werden.");
        }

        BigDecimal shareGross = origin.getAmount().divide(TWO, 2, RoundingMode.HALF_UP);
        UUID group = origin.getSplitGroupId() != null ? origin.getSplitGroupId() : UUID.randomUUID();
        String ownerName = origin.getCreatedByUsername();

        // Der Partner stellt dem Ersteller seinen Anteil in Rechnung.
        FinanceEntry partnerIncome = shareEntry(origin, TYPE_INCOME, partnerId, partnerName,
                ownerName, shareGross, group, SPLIT_SHARE_IN,
                "Anteil von " + displayName(ownerName));
        partnerIncome.setVatDeductible(null);

        // Beim Ersteller ist dieselbe Rechnung Aufwand — mit abziehbarer Vorsteuer.
        FinanceEntry ownExpense = shareEntry(origin, TYPE_EXPENSE, origin.getCreatedBy(), ownerName,
                partnerName, shareGross, group, SPLIT_SHARE_OUT,
                "Anteil an " + displayName(partnerName));
        ownExpense.setVatDeductible(true);

        repository.save(partnerIncome);
        repository.save(ownExpense);

        // Die Kundenrechnung bleibt in voller Höhe beim Ersteller.
        origin.setSplitGroupId(group);
        origin.setSplitRole(SPLIT_ORIGIN);
        origin.setSplitPartnerUsername(partnerName);

        return repository.save(origin);
    }

    /** Eine der beiden Seiten der internen Anteilsrechnung. */
    private FinanceEntry shareEntry(FinanceEntry source, String type, UUID ownerId, String ownerName,
                                    String partnerName, BigDecimal gross, UUID group,
                                    String role, String suffix) {
        FinanceEntry share = new FinanceEntry();
        share.setType(type);
        share.setKind(KIND_INVOICE);
        // Die interne Verrechnung ist gestellt, aber noch nicht bezahlt.
        share.setStatus(STATUS_SENT);
        share.setDescription(source.getDescription() + " — " + suffix);
        share.setDate(source.getDate());
        share.setVatRate(source.getVatRate());
        share.setInputMode(VatCalculator.MODE_GROSS);
        share.setAmount(gross);
        share.setCustomerId(source.getCustomerId());
        share.setCustomerName(source.getCustomerName());
        share.setCreatedBy(ownerId);
        share.setCreatedByUsername(ownerName);
        share.setSplitGroupId(group);
        share.setSplitRole(role);
        share.setSplitPartnerUsername(partnerName);
        normalize(share);
        return share;
    }

    private static String displayName(String username) {
        return username != null ? username : "Partner";
    }

    /**
     * Löscht einen Eintrag. Gehört er zu einer geteilten Buchung, verschwinden
     * beide Hälften — eine allein stehende Hälfte wäre eine halbe Einnahme ohne
     * Gegenstück und würde die Auswertung verfälschen.
     */
    public void delete(UUID id) {
        FinanceEntry entry = repository.findById(id).orElse(null);
        if (entry == null) return;

        List<FinanceEntry> group = entry.isSplitHalf()
                ? repository.findBySplitGroupId(entry.getSplitGroupId())
                : List.of(entry);

        for (FinanceEntry e : group) {
            if (repository.countByParentId(e.getId()) > 0) {
                throw new IllegalStateException(
                        "Eintrag hat verknüpfte Anzahlungen — diese zuerst löschen oder umhängen.");
            }
        }
        repository.deleteAll(group);
    }

    /**
     * Füllt aus Betrag + Eingabemodus + USt-Satz die drei Betragsfelder und
     * ergänzt fehlende Vorgaben. Idempotent: mehrfaches Aufrufen ändert nichts.
     */
    void normalize(FinanceEntry entry) {
        if (entry.getKind() == null) entry.setKind(KIND_INVOICE);
        if (entry.getInputMode() == null) entry.setInputMode(VatCalculator.MODE_GROSS);
        if (entry.getVatRate() == null) entry.setVatRate(BigDecimal.ZERO);

        if (entry.getStatus() == null) {
            // Ausgaben tippt man normalerweise ein, nachdem man bezahlt hat.
            // Einnahmen gelten als verschickt und damit offen — DRAFT gibt es in
            // der Oberfläche nicht mehr, der Status bleibt nur für Altdaten gültig.
            entry.setStatus(TYPE_EXPENSE.equals(entry.getType()) ? STATUS_PAID : STATUS_SENT);
        }

        if (TYPE_EXPENSE.equals(entry.getType())) {
            if (entry.getVatDeductible() == null) entry.setVatDeductible(true);
            // Die Partnerangabe ist auch hier nur eine Anweisung zum Aufteilen
            // und wird nie am Eintrag gespeichert — create/update haben sie
            // vorher schon ausgelesen.
            entry.setSharedWithUserId(null);
            entry.setSharedWithUsername(null);
        } else {
            entry.setVatDeductible(null);
        }

        var amounts = VatCalculator.of(entry.getAmount(), entry.getInputMode(), entry.getVatRate());
        entry.setNetAmount(amounts.netAmount());
        entry.setVatAmount(amounts.vatAmount());
        entry.setAmount(amounts.grossAmount());
    }

    private void validate(FinanceEntry entry) {
        if (!VatCalculator.isAllowedRate(entry.getVatRate())) {
            throw new IllegalArgumentException("Unzulässiger USt-Satz: " + entry.getVatRate());
        }
        if (entry.getParentId() != null) {
            if (!KIND_DEPOSIT.equals(entry.getKind())) {
                throw new IllegalArgumentException("Nur Anzahlungen können mit einer Rechnung verknüpft werden.");
            }
            if (entry.getParentId().equals(entry.getId())) {
                throw new IllegalArgumentException("Eine Anzahlung kann nicht auf sich selbst verweisen.");
            }
            FinanceEntry parent = repository.findById(entry.getParentId())
                    .orElseThrow(() -> new IllegalArgumentException("Verknüpfte Rechnung existiert nicht."));
            if (KIND_DEPOSIT.equals(parent.getKind())) {
                throw new IllegalArgumentException("Eine Anzahlung kann nicht auf eine Anzahlung verweisen.");
            }
        }
    }

    /**
     * Einmaliger Backfill für Einträge aus der Zeit vor der USt-Erweiterung.
     *
     * Altbestand hatte nur einen Betrag ohne USt-Angabe. Der wird als Brutto mit
     * 0 % gewertet — inhaltlich das Ehrlichste, weil damals keine USt erfasst wurde.
     * Läuft beim Start und ist idempotent.
     */
    public int backfillLegacyEntries() {
        List<FinanceEntry> legacy = repository.findNeedingBackfill();
        if (legacy.isEmpty()) return 0;

        for (FinanceEntry entry : legacy) {
            if (entry.getVatRate() == null) entry.setVatRate(BigDecimal.ZERO);
            if (entry.getInputMode() == null) entry.setInputMode(VatCalculator.MODE_GROSS);
            if (entry.getKind() == null) entry.setKind(KIND_INVOICE);
            // Altbestand ist abgeschlossen — sonst stünde plötzlich alles auf "offen".
            if (entry.getStatus() == null) entry.setStatus(STATUS_PAID);
            normalize(entry);
        }
        repository.saveAll(legacy);
        log.info("Finanz-Backfill: {} Alteinträge auf das neue Schema gehoben", legacy.size());
        return legacy.size();
    }
}
