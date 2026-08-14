package com.collabcrm.service;

import com.collabcrm.model.FinanceEntry;
import com.collabcrm.model.FinanceSettings;
import com.collabcrm.repository.FinanceEntryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

/**
 * Rechnet die Finanzzahlen pro Person und Kalenderjahr aus.
 *
 * <h2>Zuordnung</h2>
 * Ausgaben gehören immer dem, der sie eingetragen hat — geteilt werden nur
 * Einnahmen, und auch nur, wenn sie ausdrücklich als geteilt markiert sind.
 *
 * <h2>Umsatzsteuer bei geteilten Einnahmen</h2>
 * Die USt-Schuld bleibt IMMER vollständig beim Rechnungssteller, auch wenn der
 * Betrag geteilt wird — nur er hat die Rechnung gelegt und schuldet sie dem
 * Finanzamt. Geteilt wird je nach Einstellung der Brutto- oder der Nettobetrag:
 *
 * <pre>
 *   Rechnung 1.200 brutto (1.000 netto + 200 USt), geteilt
 *
 *   splitBasis = GROSS          splitBasis = NET
 *     A: 600 brutto − 200 USt     A: 700 brutto − 200 USt  = 500 netto
 *        = 400 netto              B: 500 brutto            = 500 netto
 *     B: 600 brutto = 600 netto
 * </pre>
 *
 * Bei GROSS bekommen beide gleich viel Geld, aber A zahlt die USt allein und
 * behält real weniger. Bei NET bleiben beide gleichauf. Beides ist eine
 * bewusste Entscheidung und über die Einstellungen umschaltbar.
 *
 * <h2>Anzahlungen</h2>
 * Eine Anzahlung mit Verweis auf eine Rechnung ist eine ZAHLUNG auf diese
 * Rechnung, kein zusätzlicher Umsatz — sonst stünde der Betrag doppelt in den
 * Büchern. Sie mindert nur den offenen Rest. Eine Anzahlung ohne Verweis zählt
 * dagegen wie eine normale Einnahme.
 *
 * <h2>Grenzwerte</h2>
 * SVS-Versicherungsgrenze gegen den Gewinn, Kleinunternehmergrenze gegen den
 * Umsatz — zwei verschiedene Bemessungsgrundlagen.
 */
@Service
@Transactional(readOnly = true)
public class FinanceStatsService {

    private static final int SCALE = 2;
    private static final BigDecimal TWO = new BigDecimal("2");

    private final FinanceEntryRepository repository;
    private final FinanceSettingsService settingsService;

    public FinanceStatsService(FinanceEntryRepository repository, FinanceSettingsService settingsService) {
        this.repository = repository;
        this.settingsService = settingsService;
    }

    /** Sammelt die Zahlen einer Person zusammen, bevor sie in die Ausgabe wandern. */
    private static final class Totals {
        final UUID userId;
        final String username;
        BigDecimal revenueGross = zero();
        BigDecimal vatOwed = zero();
        BigDecimal expenseCost = zero();
        BigDecimal inputVat = zero();
        BigDecimal openReceivables = zero();

        Totals(UUID userId, String username) {
            this.userId = userId;
            this.username = username;
        }

        /** Netto-Umsatz nach Abzug der eigenen USt-Schuld */
        BigDecimal revenueNet() { return revenueGross.subtract(vatOwed); }

        /** Gewinn = Netto-Umsatz minus Aufwand. Grundlage für die SVS-Grenze. */
        BigDecimal profit() { return revenueNet().subtract(expenseCost); }

        /** Zahllast ans Finanzamt = eingenommene USt minus Vorsteuer */
        BigDecimal vatBalance() { return vatOwed.subtract(inputVat); }
    }

    /**
     * Was aus einer Aufteilung nur zwischen den beiden hin- und hergeht.
     *
     * In den Buechern der einzelnen Person ist die Anteilsrechnung echter Umsatz
     * bzw. echter Aufwand — dort muss sie stehen bleiben, sie zaehlt etwa auf die
     * Kleinunternehmergrenze. Fuer die Jahressumme ueber BEIDE waere sie aber
     * doppelt gezaehlt: derselbe Kundenauftrag einmal beim Ersteller und einmal
     * als interne Weiterverrechnung. Deshalb hier mitgefuehrt und am Ende abgezogen.
     */
    private static final class Internal {
        BigDecimal revenueGross = zero();
        BigDecimal vatOwed = zero();
        BigDecimal expenseCost = zero();
        BigDecimal inputVat = zero();
        BigDecimal open = zero();
    }

    /** Die beiden Haelften einer Aufteilung — die Kundenrechnung selbst zaehlt normal. */
    private static boolean isInternalShare(FinanceEntry entry) {
        return FinanceService.SPLIT_SHARE_IN.equals(entry.getSplitRole())
                || FinanceService.SPLIT_SHARE_OUT.equals(entry.getSplitRole());
    }

    public Map<String, Object> stats(int year) {
        FinanceSettings settings = settingsService.forYear(year);

        /*
          Umsaetze ausserhalb dieses CRM. Die Kleinunternehmergrenze gilt pro
          Person ueber ALLE ihre Umsaetze — was hier nicht erfasst ist, muss
          trotzdem mitzaehlen, sonst wirkt die Grenze weiter weg als sie ist.
        */
        Map<UUID, BigDecimal> external = new HashMap<>();
        for (var row : settingsService.externalRevenue(year)) {
            external.merge(row.getUserId(), orZero(row.getAmount()), BigDecimal::add);
        }
        boolean splitGross = !FinanceSettingsService.SPLIT_NET.equals(settings.getSplitBasis());

        List<FinanceEntry> all = repository.findAllByOrderByDateDescCreatedAtDesc();
        Map<UUID, BigDecimal> paidDepositsByParent = paidDepositsByParent(all);

        List<FinanceEntry> inYear = all.stream()
                .filter(e -> e.getDate() != null && e.getDate().getYear() == year)
                .toList();

        Map<UUID, Totals> byUser = new LinkedHashMap<>();
        List<Map<String, Object>> openEntries = new ArrayList<>();
        Internal internal = new Internal();

        for (FinanceEntry entry : inYear) {
            if (FinanceService.TYPE_EXPENSE.equals(entry.getType())) {
                applyExpense(byUser, entry, internal);
            } else {
                applyIncome(byUser, entry, splitGross, internal);
                collectOpenReceivable(byUser, entry, paidDepositsByParent, openEntries, internal);
            }
        }

        return buildResponse(year, settings, byUser, openEntries, internal, external);
    }

    /**
     * Ausgaben: ist die Vorsteuer abziehbar, ist nur der Nettobetrag Aufwand und
     * die USt holt man sich zurück. Ist sie es nicht (Bewirtung, Privatanteil,
     * Beleg ohne USt-Ausweis), sind die vollen Bruttokosten Aufwand.
     */
    private void applyExpense(Map<UUID, Totals> byUser, FinanceEntry entry, Internal internal) {
        Totals t = totalsFor(byUser, entry.getCreatedBy(), entry.getCreatedByUsername());
        boolean deductible = Boolean.TRUE.equals(entry.getVatDeductible());

        BigDecimal cost = deductible ? net(entry) : gross(entry);
        t.expenseCost = t.expenseCost.add(cost);
        if (deductible) {
            t.inputVat = t.inputVat.add(vat(entry));
        }

        // Dieselbe Formel, damit sich der Abzug in der Jahressumme exakt aufhebt.
        if (isInternalShare(entry)) {
            internal.expenseCost = internal.expenseCost.add(cost);
            if (deductible) {
                internal.inputVat = internal.inputVat.add(vat(entry));
            }
        }
    }

    /**
     * Einnahmen. Verknüpfte Anzahlungen werden übersprungen — sie sind Zahlungen
     * auf eine bereits erfasste Rechnung und kein eigener Umsatz.
     */
    private void applyIncome(Map<UUID, Totals> byUser, FinanceEntry entry, boolean splitGross,
                             Internal internal) {
        if (entry.isLinkedDeposit()) return;

        Totals creator = totalsFor(byUser, entry.getCreatedBy(), entry.getCreatedByUsername());

        // Die USt schuldet immer nur der Rechnungssteller, unabhängig von der Aufteilung.
        creator.vatOwed = creator.vatOwed.add(vat(entry));

        if (isInternalShare(entry)) {
            internal.revenueGross = internal.revenueGross.add(gross(entry));
            internal.vatOwed = internal.vatOwed.add(vat(entry));
        }

        if (!entry.isShared()) {
            creator.revenueGross = creator.revenueGross.add(gross(entry));
            return;
        }

        Totals partner = totalsFor(byUser, entry.getSharedWithUserId(), entry.getSharedWithUsername());
        BigDecimal shareable = splitGross ? gross(entry) : net(entry);

        // Der Partneranteil wird gerundet, der Rest bleibt beim Ersteller. So ergeben
        // beide Hälften auch bei ungeraden Cent-Beträgen wieder exakt die Summe.
        BigDecimal partnerShare = shareable.divide(TWO, SCALE, RoundingMode.HALF_UP);
        BigDecimal creatorShare = gross(entry).subtract(partnerShare);

        creator.revenueGross = creator.revenueGross.add(creatorShare);
        partner.revenueGross = partner.revenueGross.add(partnerShare);
    }

    /**
     * Offene Forderungen: alles, was verschickt aber noch nicht bezahlt ist,
     * abzüglich bereits bezahlter Anzahlungen. Entwürfe zählen nicht — die sind
     * noch gar nicht raus.
     */
    private void collectOpenReceivable(Map<UUID, Totals> byUser, FinanceEntry entry,
                                       Map<UUID, BigDecimal> paidDepositsByParent,
                                       List<Map<String, Object>> openEntries,
                                       Internal internal) {
        if (!FinanceService.STATUS_SENT.equals(entry.getStatus()) || entry.isLinkedDeposit()) return;

        BigDecimal paid = paidDepositsByParent.getOrDefault(entry.getId(), zero());
        BigDecimal open = gross(entry).subtract(paid);
        if (open.signum() <= 0) return;

        Totals t = totalsFor(byUser, entry.getCreatedBy(), entry.getCreatedByUsername());
        t.openReceivables = t.openReceivables.add(open);
        if (isInternalShare(entry)) {
            internal.open = internal.open.add(open);
        }

        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", entry.getId().toString());
        row.put("description", entry.getDescription());
        row.put("date", entry.getDate().toString());
        row.put("username", entry.getCreatedByUsername());
        row.put("gross", gross(entry));
        row.put("paid", paid);
        row.put("open", open);
        // Netto zum RESTbetrag, nicht zur ganzen Rechnung: nach einer Anzahlung
        // ist der offene Teil kleiner, und nur der steht hier zur Debatte.
        row.put("openNet", VatCalculator.fromGross(open, entry.getVatRate()).netAmount());
        // Die interne Anteilsrechnung ist kein Aussenstand beim Kunden, sondern
        // eine Umbuchung unter den beiden. Die Liste trennt das danach auf.
        row.put("internal", FinanceService.SPLIT_SHARE_IN.equals(entry.getSplitRole()));
        row.put("partner", entry.getSplitPartnerUsername());
        openEntries.add(row);
    }

    /**
     * Offene KUNDENforderungen, jahresübergreifend — für das Dashboard.
     *
     * Bewusst ohne Jahresgrenze: eine Rechnung vom Dezember, die im Januar noch
     * offen ist, gehört genau dann auf die Startseite.
     *
     * Interne Anteilsrechnungen bleiben draussen: auf der Startseite steht die
     * Frage "wer schuldet uns noch Geld von aussen". Was einer von beiden dem
     * anderen schuldet, aendert am Geld der Firma nichts und wird nur in den
     * Finanzen gefuehrt.
     */
    public List<Map<String, Object>> openReceivables() {
        List<FinanceEntry> all = repository.findAllByOrderByDateDescCreatedAtDesc();
        Map<UUID, BigDecimal> paidDeposits = paidDepositsByParent(all);

        List<Map<String, Object>> open = new ArrayList<>();
        for (FinanceEntry entry : all) {
            if (!FinanceService.TYPE_INCOME.equals(entry.getType())) continue;
            if (!FinanceService.STATUS_SENT.equals(entry.getStatus()) || entry.isLinkedDeposit()) continue;
            if (isInternalShare(entry)) continue;

            BigDecimal paid = paidDeposits.getOrDefault(entry.getId(), zero());
            BigDecimal rest = gross(entry).subtract(paid);
            if (rest.signum() <= 0) continue;

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", entry.getId().toString());
            row.put("description", entry.getDescription());
            row.put("date", entry.getDate().toString());
            row.put("username", entry.getCreatedByUsername());
            row.put("customerName", entry.getCustomerName());
            row.put("gross", gross(entry));
            row.put("paid", paid);
            row.put("open", rest);
            open.add(row);
        }
        return open;
    }

    /** Summe der bezahlten Anzahlungen je Rechnung — jahresübergreifend. */
    private Map<UUID, BigDecimal> paidDepositsByParent(List<FinanceEntry> all) {
        Map<UUID, BigDecimal> map = new HashMap<>();
        for (FinanceEntry e : all) {
            if (e.isLinkedDeposit() && FinanceService.STATUS_PAID.equals(e.getStatus())) {
                map.merge(e.getParentId(), gross(e), BigDecimal::add);
            }
        }
        return map;
    }

    private Map<String, Object> buildResponse(int year, FinanceSettings settings,
                                              Map<UUID, Totals> byUser,
                                              List<Map<String, Object>> openEntries,
                                              Internal internal,
                                              Map<UUID, BigDecimal> external) {
        BigDecimal totalRevenueGross = zero();
        BigDecimal totalExpenseCost = zero();
        BigDecimal totalVatOwed = zero();
        BigDecimal totalInputVat = zero();
        BigDecimal totalOpen = zero();

        List<Map<String, Object>> perUser = new ArrayList<>();
        for (Totals t : byUser.values()) {
            totalRevenueGross = totalRevenueGross.add(t.revenueGross);
            totalExpenseCost = totalExpenseCost.add(t.expenseCost);
            totalVatOwed = totalVatOwed.add(t.vatOwed);
            totalInputVat = totalInputVat.add(t.inputVat);
            totalOpen = totalOpen.add(t.openReceivables);

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("userId", t.userId != null ? t.userId.toString() : null);
            row.put("username", t.username != null ? t.username : "—");
            row.put("revenueGross", t.revenueGross);
            row.put("revenueNet", t.revenueNet());
            row.put("vatOwed", t.vatOwed);
            row.put("expenseCost", t.expenseCost);
            row.put("inputVat", t.inputVat);
            row.put("vatBalance", t.vatBalance());
            row.put("profit", t.profit());
            row.put("openReceivables", t.openReceivables);
            row.put("svs", thresholdProgress(t.profit(), settings.getSvsThreshold()));
            BigDecimal outside = external.getOrDefault(t.userId, zero());
            row.put("externalRevenue", outside);
            row.put("smallBusiness",
                    thresholdProgress(t.revenueGross.add(outside), settings.getSmallBusinessThreshold()));
            perUser.add(row);
        }
        perUser.sort(Comparator.comparing(r -> String.valueOf(r.get("username"))));

        Map<String, Object> settingsOut = new LinkedHashMap<>();
        settingsOut.put("year", settings.getYear());
        settingsOut.put("svsThreshold", settings.getSvsThreshold());
        settingsOut.put("smallBusinessThreshold", settings.getSmallBusinessThreshold());
        settingsOut.put("splitBasis", settings.getSplitBasis());

        /*
          Jahressumme ueber BEIDE: die interne Weiterverrechnung fliegt raus,
          sonst stuende derselbe Kundenauftrag zweimal im Umsatz. Am Gewinn und
          an der Zahllast aendert das nichts — dort hoben sich die beiden Seiten
          schon vorher gegenseitig auf.
        */
        BigDecimal groupRevenueGross = totalRevenueGross.subtract(internal.revenueGross);
        BigDecimal groupVatOwed = totalVatOwed.subtract(internal.vatOwed);
        BigDecimal groupExpenseCost = totalExpenseCost.subtract(internal.expenseCost);
        BigDecimal groupInputVat = totalInputVat.subtract(internal.inputVat);
        BigDecimal groupRevenueNet = groupRevenueGross.subtract(groupVatOwed);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("year", year);
        out.put("settings", settingsOut);
        out.put("totalRevenueGross", groupRevenueGross);
        out.put("totalRevenueNet", groupRevenueNet);
        out.put("totalExpenseCost", groupExpenseCost);
        out.put("totalVatOwed", groupVatOwed);
        out.put("totalInputVat", groupInputVat);
        out.put("totalVatBalance", groupVatOwed.subtract(groupInputVat));
        out.put("totalProfit", groupRevenueNet.subtract(groupExpenseCost));
        // "Offen" heisst: ein Kunde schuldet uns Geld. Was einer von beiden dem
        // anderen schuldet, steht daneben und wird nie dazugezaehlt.
        out.put("totalOpen", totalOpen.subtract(internal.open));
        out.put("totalOpenInternal", internal.open);
        out.put("perUser", perUser);
        out.put("openEntries", openEntries);
        return out;
    }

    /** Fortschritt gegen eine Grenze: Betrag, Grenze, Prozent und Rest. */
    private Map<String, Object> thresholdProgress(BigDecimal current, BigDecimal threshold) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("current", current);
        map.put("threshold", threshold);

        boolean usable = threshold != null && threshold.signum() > 0;
        BigDecimal percent = usable
                ? current.max(zero()).multiply(new BigDecimal("100"))
                        .divide(threshold, SCALE, RoundingMode.HALF_UP)
                : zero();

        map.put("percent", percent);
        map.put("remaining", usable ? threshold.subtract(current) : zero());
        map.put("exceeded", usable && current.compareTo(threshold) > 0);
        return map;
    }

    private Totals totalsFor(Map<UUID, Totals> byUser, UUID userId, String username) {
        return byUser.computeIfAbsent(userId, id -> new Totals(id, username));
    }

    private static BigDecimal gross(FinanceEntry e) { return orZero(e.getAmount()); }
    private static BigDecimal net(FinanceEntry e) { return orZero(e.getNetAmount()); }
    private static BigDecimal vat(FinanceEntry e) { return orZero(e.getVatAmount()); }

    private static BigDecimal orZero(BigDecimal v) {
        return v == null ? zero() : v;
    }

    private static BigDecimal zero() {
        return BigDecimal.ZERO.setScale(SCALE);
    }
}
