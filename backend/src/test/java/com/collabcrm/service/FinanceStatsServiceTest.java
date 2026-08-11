package com.collabcrm.service;

import com.collabcrm.model.FinanceEntry;
import com.collabcrm.model.FinanceSettings;
import com.collabcrm.repository.FinanceEntryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class FinanceStatsServiceTest {

    private static final int YEAR = 2026;
    private static final UUID ALICE = UUID.randomUUID();
    private static final UUID BOB = UUID.randomUUID();

    @Mock
    private FinanceEntryRepository repository;

    @Mock
    private FinanceSettingsService settingsService;

    private FinanceStatsService service;

    @BeforeEach
    void setUp() {
        service = new FinanceStatsService(repository, settingsService);
        useSettings(FinanceSettingsService.SPLIT_GROSS, "6613.20", "55000");
    }

    // ── Aufteilung ────────────────────────────────────────────────────

    @Test
    void nichtGeteilteEinnahmeGehoertKomplettDemErsteller() {
        givenEntries(income(ALICE, "alice", "1200.00", "20", YEAR));

        var stats = service.stats(YEAR);

        assertThat(user(stats, "alice")).containsEntry("revenueGross", dec("1200.00"));
        assertThat(perUser(stats)).hasSize(1);
    }

    /**
     * Die bewusst gewählte Brutto-Aufteilung: beide bekommen gleich viel Geld
     * gutgeschrieben, die USt schuldet aber allein der Rechnungssteller. Real
     * bleibt Alice deshalb weniger als Bob — genau das soll sichtbar sein.
     */
    @Test
    void geteilteEinnahmeWirdBruttoHalbiertUstBleibtBeimSteller() {
        givenEntries(shared(income(ALICE, "alice", "1200.00", "20", YEAR), BOB, "bob"));

        var stats = service.stats(YEAR);

        assertThat(user(stats, "alice"))
                .containsEntry("revenueGross", dec("600.00"))
                .containsEntry("vatOwed", dec("200.00"))
                .containsEntry("revenueNet", dec("400.00"))
                .containsEntry("profit", dec("400.00"));

        assertThat(user(stats, "bob"))
                .containsEntry("revenueGross", dec("600.00"))
                .containsEntry("vatOwed", dec("0.00"))
                .containsEntry("profit", dec("600.00"));

        // Zusammen bleibt der volle Nettobetrag übrig
        assertThat(stats).containsEntry("totalProfit", dec("1000.00"));
    }

    @Test
    void beiNettoBasisStehenBeideGleich() {
        useSettings(FinanceSettingsService.SPLIT_NET, "6613.20", "55000");
        givenEntries(shared(income(ALICE, "alice", "1200.00", "20", YEAR), BOB, "bob"));

        var stats = service.stats(YEAR);

        assertThat(user(stats, "alice")).containsEntry("profit", dec("500.00"));
        assertThat(user(stats, "bob")).containsEntry("profit", dec("500.00"));
    }

    @Test
    void ungeradeCentGehenBeiDerTeilungNichtVerloren() {
        givenEntries(shared(income(ALICE, "alice", "1000.01", "0", YEAR), BOB, "bob"));

        var stats = service.stats(YEAR);

        BigDecimal alice = (BigDecimal) user(stats, "alice").get("revenueGross");
        BigDecimal bob = (BigDecimal) user(stats, "bob").get("revenueGross");

        assertThat(alice.add(bob))
                .as("beide Hälften müssen zusammen wieder den vollen Betrag ergeben")
                .isEqualByComparingTo("1000.01");
    }

    /**
     * Der vollständige Ablauf einer geteilten Einnahme, so wie ihn der Service
     * anlegt: alice fakturiert dem Kunden 1.200, bob stellt ihr 600 in Rechnung,
     * alice zieht bobs USt als Vorsteuer.
     *
     * Prüft genau das, was in der Praxis stimmen muss: der Umsatz steht bei jedem
     * in voller fakturierter Höhe, die USt-Schuld des einen ist die Vorsteuer des
     * anderen, und zusammen bleibt exakt die USt beim Finanzamt, die der Kunde
     * gezahlt hat.
     */
    @Test
    void geteilteEinnahmeErgibtProPersonDieRichtigenSteuerzahlen() {
        FinanceEntry kundenrechnung = income(ALICE, "alice", "1200.00", "20", YEAR);
        FinanceEntry bobsAnteil = income(BOB, "bob", "600.00", "20", YEAR);
        FinanceEntry alicesAufwand = expense(ALICE, "alice", "600.00", "20", true, YEAR);

        givenEntries(kundenrechnung, bobsAnteil, alicesAufwand);

        var stats = service.stats(YEAR);

        assertThat(user(stats, "alice"))
                .containsEntry("revenueGross", dec("1200.00"))
                .containsEntry("vatOwed", dec("200.00"))
                .containsEntry("expenseCost", dec("500.00"))
                .containsEntry("inputVat", dec("100.00"))
                .containsEntry("profit", dec("500.00"))
                .containsEntry("vatBalance", dec("100.00"));

        assertThat(user(stats, "bob"))
                .containsEntry("revenueGross", dec("600.00"))
                .containsEntry("vatOwed", dec("100.00"))
                .containsEntry("inputVat", dec("0.00"))
                .containsEntry("profit", dec("500.00"))
                .containsEntry("vatBalance", dec("100.00"));

        // Zusammen genau die 200 USt, die der Kunde gezahlt hat
        assertThat(stats).containsEntry("totalVatBalance", dec("200.00"));
        // Und zusammen die 1.000 netto, die tatsächlich verdient wurden
        assertThat(stats).containsEntry("totalProfit", dec("1000.00"));
    }

    /** Ohne die Gegenbuchung bei alice wäre die USt doppelt beim Finanzamt. */
    @Test
    void ohneGegenbuchungWaereDieUstDoppelt() {
        givenEntries(
                income(ALICE, "alice", "1200.00", "20", YEAR),
                income(BOB, "bob", "600.00", "20", YEAR));

        assertThat(service.stats(YEAR))
                .as("200 + 100 statt der korrekten 200")
                .containsEntry("totalVatBalance", dec("300.00"));
    }

    // ── Ausgaben und Vorsteuer ────────────────────────────────────────

    @Test
    void abziehbareVorsteuerMachtNurDasNettoZumAufwand() {
        givenEntries(expense(ALICE, "alice", "120.00", "20", true, YEAR));

        var stats = service.stats(YEAR);

        assertThat(user(stats, "alice"))
                .containsEntry("expenseCost", dec("100.00"))
                .containsEntry("inputVat", dec("20.00"))
                .containsEntry("vatBalance", dec("-20.00"));
    }

    @Test
    void ohneVorsteuerabzugSindDieVollenBruttokostenAufwand() {
        givenEntries(expense(ALICE, "alice", "120.00", "20", false, YEAR));

        var stats = service.stats(YEAR);

        assertThat(user(stats, "alice"))
                .containsEntry("expenseCost", dec("120.00"))
                .containsEntry("inputVat", dec("0.00"));
    }

    @Test
    void ausgabenWerdenNieGeteilt() {
        FinanceEntry e = expense(ALICE, "alice", "120.00", "20", true, YEAR);
        e.setSharedWithUserId(BOB);
        e.setSharedWithUsername("bob");
        givenEntries(e);

        var stats = service.stats(YEAR);

        assertThat(perUser(stats)).hasSize(1);
        assertThat(user(stats, "alice")).containsEntry("expenseCost", dec("100.00"));
    }

    @Test
    void zahllastIstEingenommeneUstMinusVorsteuer() {
        givenEntries(
                income(ALICE, "alice", "1200.00", "20", YEAR),
                expense(ALICE, "alice", "600.00", "20", true, YEAR));

        var stats = service.stats(YEAR);

        // 200 eingenommen − 100 Vorsteuer
        assertThat(user(stats, "alice")).containsEntry("vatBalance", dec("100.00"));
        assertThat(stats).containsEntry("totalVatBalance", dec("100.00"));
    }

    // ── Anzahlungen ───────────────────────────────────────────────────

    @Test
    void verknuepfteAnzahlungIstZahlungUndKeinZusaetzlicherUmsatz() {
        FinanceEntry rechnung = income(ALICE, "alice", "3000.00", "0", YEAR);
        rechnung.setStatus(FinanceService.STATUS_SENT);
        UUID rechnungId = idOf(rechnung);

        FinanceEntry anzahlung = income(ALICE, "alice", "1000.00", "0", YEAR);
        anzahlung.setKind(FinanceService.KIND_DEPOSIT);
        anzahlung.setParentId(rechnungId);
        anzahlung.setStatus(FinanceService.STATUS_PAID);

        givenEntries(rechnung, anzahlung);

        var stats = service.stats(YEAR);

        assertThat(user(stats, "alice"))
                .as("3000 statt 4000 — die Anzahlung ist Teil der Rechnung")
                .containsEntry("revenueGross", dec("3000.00"));
        assertThat(stats).containsEntry("totalOpen", dec("2000.00"));
    }

    @Test
    void anzahlungOhneVerknuepfungIstEinEigenerUmsatz() {
        FinanceEntry anzahlung = income(ALICE, "alice", "1000.00", "0", YEAR);
        anzahlung.setKind(FinanceService.KIND_DEPOSIT);
        givenEntries(anzahlung);

        var stats = service.stats(YEAR);

        assertThat(user(stats, "alice")).containsEntry("revenueGross", dec("1000.00"));
    }

    @Test
    void unbezahlteAnzahlungMindertDenOffenenBetragNicht() {
        FinanceEntry rechnung = income(ALICE, "alice", "3000.00", "0", YEAR);
        rechnung.setStatus(FinanceService.STATUS_SENT);

        FinanceEntry anzahlung = income(ALICE, "alice", "1000.00", "0", YEAR);
        anzahlung.setKind(FinanceService.KIND_DEPOSIT);
        anzahlung.setParentId(idOf(rechnung));
        anzahlung.setStatus(FinanceService.STATUS_SENT);

        givenEntries(rechnung, anzahlung);

        assertThat(service.stats(YEAR)).containsEntry("totalOpen", dec("3000.00"));
    }

    // ── Offene Posten ─────────────────────────────────────────────────

    @Test
    void nurGesendeteRechnungenGeltenAlsOffen() {
        FinanceEntry entwurf = income(ALICE, "alice", "500.00", "0", YEAR);
        entwurf.setStatus(FinanceService.STATUS_DRAFT);

        FinanceEntry bezahlt = income(ALICE, "alice", "700.00", "0", YEAR);
        bezahlt.setStatus(FinanceService.STATUS_PAID);

        FinanceEntry offen = income(ALICE, "alice", "900.00", "0", YEAR);
        offen.setStatus(FinanceService.STATUS_SENT);

        givenEntries(entwurf, bezahlt, offen);

        var stats = service.stats(YEAR);

        assertThat(stats).containsEntry("totalOpen", dec("900.00"));
        assertThat(openEntries(stats)).hasSize(1);
        assertThat(openEntries(stats).getFirst()).containsEntry("open", dec("900.00"));
    }

    // ── Grenzwerte ────────────────────────────────────────────────────

    @Test
    void svsRechnetGegenGewinnUndKleinunternehmerGegenUmsatz() {
        givenEntries(
                income(ALICE, "alice", "10000.00", "0", YEAR),
                expense(ALICE, "alice", "4000.00", "0", true, YEAR));

        var stats = service.stats(YEAR);

        @SuppressWarnings("unchecked")
        Map<String, Object> svs = (Map<String, Object>) user(stats, "alice").get("svs");
        @SuppressWarnings("unchecked")
        Map<String, Object> kleinunternehmer = (Map<String, Object>) user(stats, "alice").get("smallBusiness");

        // Gewinn 6.000 von 6.613,20
        assertThat(svs).containsEntry("current", dec("6000.00"));
        assertThat((BigDecimal) svs.get("percent")).isEqualByComparingTo("90.73");
        assertThat(svs).containsEntry("exceeded", false);

        // Umsatz 10.000 von 55.000 — ohne Abzug der Ausgaben
        assertThat(kleinunternehmer).containsEntry("current", dec("10000.00"));
        assertThat((BigDecimal) kleinunternehmer.get("percent")).isEqualByComparingTo("18.18");
    }

    @Test
    void ueberschritteneGrenzeWirdMarkiert() {
        givenEntries(income(ALICE, "alice", "7000.00", "0", YEAR));

        var stats = service.stats(YEAR);

        @SuppressWarnings("unchecked")
        Map<String, Object> svs = (Map<String, Object>) user(stats, "alice").get("svs");

        assertThat(svs).containsEntry("exceeded", true);
        assertThat((BigDecimal) svs.get("remaining")).isNegative();
    }

    // ── Jahresabgrenzung ──────────────────────────────────────────────

    @Test
    void nurEintraegeDesAngefragtenJahresZaehlen() {
        givenEntries(
                income(ALICE, "alice", "1000.00", "0", YEAR),
                income(ALICE, "alice", "9999.00", "0", YEAR - 1));

        assertThat(user(service.stats(YEAR), "alice")).containsEntry("revenueGross", dec("1000.00"));
    }

    /** Anzahlungen aus einem anderen Jahr müssen den offenen Rest trotzdem mindern. */
    @Test
    void anzahlungAusDemVorjahrMindertDenOffenenBetrag() {
        FinanceEntry rechnung = income(ALICE, "alice", "3000.00", "0", YEAR);
        rechnung.setStatus(FinanceService.STATUS_SENT);

        FinanceEntry anzahlung = income(ALICE, "alice", "1000.00", "0", YEAR - 1);
        anzahlung.setKind(FinanceService.KIND_DEPOSIT);
        anzahlung.setParentId(idOf(rechnung));
        anzahlung.setStatus(FinanceService.STATUS_PAID);

        givenEntries(rechnung, anzahlung);

        assertThat(service.stats(YEAR)).containsEntry("totalOpen", dec("2000.00"));
    }

    @Test
    void ohneEintraegeKommenNullenStattFehler() {
        givenEntries();

        var stats = service.stats(YEAR);

        assertThat(perUser(stats)).isEmpty();
        assertThat(stats).containsEntry("totalProfit", dec("0.00"));
        assertThat(stats).containsEntry("totalOpen", dec("0.00"));
    }

    // ── Hilfsmittel ───────────────────────────────────────────────────

    private void useSettings(String splitBasis, String svs, String smallBusiness) {
        when(settingsService.forYear(YEAR)).thenReturn(
                new FinanceSettings(YEAR, new BigDecimal(svs), new BigDecimal(smallBusiness), splitBasis));
    }

    private void givenEntries(FinanceEntry... entries) {
        when(repository.findAllByOrderByDateDescCreatedAtDesc()).thenReturn(List.of(entries));
    }

    private static FinanceEntry income(UUID user, String username, String gross, String rate, int year) {
        return entry(FinanceService.TYPE_INCOME, user, username, gross, rate, year);
    }

    private static FinanceEntry expense(UUID user, String username, String gross, String rate,
                                        boolean deductible, int year) {
        FinanceEntry e = entry(FinanceService.TYPE_EXPENSE, user, username, gross, rate, year);
        e.setVatDeductible(deductible);
        return e;
    }

    /** Baut einen Eintrag so, wie ihn FinanceService.normalize() hinterlassen würde. */
    private static FinanceEntry entry(String type, UUID user, String username,
                                      String gross, String rate, int year) {
        FinanceEntry e = new FinanceEntry();
        ReflectionTestUtils.setField(e, "id", UUID.randomUUID());
        e.setType(type);
        e.setKind(FinanceService.KIND_INVOICE);
        e.setStatus(FinanceService.STATUS_PAID);
        e.setDescription("Test");
        e.setDate(LocalDate.of(year, 6, 15));
        e.setCreatedBy(user);
        e.setCreatedByUsername(username);
        e.setVatRate(new BigDecimal(rate));
        e.setInputMode(VatCalculator.MODE_GROSS);

        var amounts = VatCalculator.fromGross(new BigDecimal(gross), new BigDecimal(rate));
        e.setAmount(amounts.grossAmount());
        e.setNetAmount(amounts.netAmount());
        e.setVatAmount(amounts.vatAmount());
        return e;
    }

    private static FinanceEntry shared(FinanceEntry entry, UUID withUser, String withUsername) {
        entry.setSharedWithUserId(withUser);
        entry.setSharedWithUsername(withUsername);
        return entry;
    }

    private static UUID idOf(FinanceEntry entry) {
        return entry.getId();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> perUser(Map<String, Object> stats) {
        return (List<Map<String, Object>>) stats.get("perUser");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> openEntries(Map<String, Object> stats) {
        return (List<Map<String, Object>>) stats.get("openEntries");
    }

    private static Map<String, Object> user(Map<String, Object> stats, String username) {
        return perUser(stats).stream()
                .filter(u -> username.equals(u.get("username")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Kein Eintrag für " + username));
    }

    private static BigDecimal dec(String value) {
        return new BigDecimal(value);
    }
}
