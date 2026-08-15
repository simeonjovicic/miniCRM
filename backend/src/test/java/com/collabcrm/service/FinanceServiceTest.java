package com.collabcrm.service;

import com.collabcrm.model.FinanceEntry;
import com.collabcrm.repository.FinanceEntryRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class FinanceServiceTest {

    @Mock
    private FinanceEntryRepository repository;

    @InjectMocks
    private FinanceService service;

    // ── Normalisierung ────────────────────────────────────────────────

    @Test
    void bruttoEingabeWirdAufgeschluesselt() {
        FinanceEntry saved = create(income("120.00", "20", VatCalculator.MODE_GROSS));

        assertThat(saved.getAmount()).isEqualByComparingTo("120.00");
        assertThat(saved.getNetAmount()).isEqualByComparingTo("100.00");
        assertThat(saved.getVatAmount()).isEqualByComparingTo("20.00");
    }

    @Test
    void nettoEingabeWirdAufBruttoHochgerechnet() {
        FinanceEntry saved = create(income("100.00", "20", VatCalculator.MODE_NET));

        assertThat(saved.getAmount())
                .as("der gespeicherte Betrag ist immer brutto")
                .isEqualByComparingTo("120.00");
        assertThat(saved.getNetAmount()).isEqualByComparingTo("100.00");
    }

    @Test
    void fehlendeAngabenBekommenVorgaben() {
        FinanceEntry entry = new FinanceEntry();
        entry.setType(FinanceService.TYPE_INCOME);
        entry.setAmount(new BigDecimal("50.00"));
        entry.setDescription("Ohne Angaben");
        entry.setDate(LocalDate.now());
        entry.setCreatedBy(UUID.randomUUID());

        FinanceEntry saved = create(entry);

        assertThat(saved.getKind()).isEqualTo(FinanceService.KIND_INVOICE);
        assertThat(saved.getInputMode()).isEqualTo(VatCalculator.MODE_GROSS);
        assertThat(saved.getVatRate()).isEqualByComparingTo("0");
        assertThat(saved.getStatus())
                .as("Einnahmen gelten als verschickt und damit offen")
                .isEqualTo(FinanceService.STATUS_SENT);
    }

    @Test
    void ausgabenGeltenStandardmaessigAlsBezahlt() {
        FinanceEntry saved = create(expense("120.00", "20"));

        assertThat(saved.getStatus()).isEqualTo(FinanceService.STATUS_PAID);
        assertThat(saved.getVatDeductible()).isTrue();
    }

    @Test
    void beiEinnahmenIstVorsteuerabzugKeinThema() {
        FinanceEntry entry = income("120.00", "20", VatCalculator.MODE_GROSS);
        entry.setVatDeductible(true);

        assertThat(create(entry).getVatDeductible()).isNull();
    }

    /**
     * Geteilte Ausgabe: zwei Buchungen ueber je die Haelfte, keine interne
     * Verrechnung. Beide tragen dadurch denselben Aufwand.
     */
    @Test
    void geteilteAusgabeWirdHalbiertUndBeidenZugeordnet() {
        List<FinanceEntry> saved = captureSaved(() -> service.create(sharedExpense("600.00", "20")));

        assertThat(saved).hasSize(2);
        assertThat(saved).allSatisfy(e -> {
            assertThat(e.getType()).isEqualTo(FinanceService.TYPE_EXPENSE);
            assertThat(e.getSplitRole()).isEqualTo(FinanceService.SPLIT_HALF);
            assertThat(e.getAmount()).isEqualByComparingTo("300.00");
            assertThat(e.getNetAmount()).isEqualByComparingTo("250.00");
            assertThat(e.getVatAmount()).isEqualByComparingTo("50.00");
        });

        // Je eine Buchung pro Person, beide in derselben Gruppe
        assertThat(saved).extracting(FinanceEntry::getCreatedByUsername)
                .containsExactlyInAnyOrder("alice", "bob");
        assertThat(saved).extracting(FinanceEntry::getSplitGroupId)
                .containsOnly(saved.getFirst().getSplitGroupId());
        // Die Partnerangabe selbst wird nie gespeichert
        assertThat(saved).extracting(FinanceEntry::getSharedWithUserId).containsOnlyNulls();
    }

    /** Ungerade Betraege: der Rest-Cent bleibt beim Ersteller, die Summe stimmt. */
    @Test
    void geteilteAusgabeVerliertKeinenCent() {
        List<FinanceEntry> saved = captureSaved(() -> service.create(sharedExpense("100.01", "0")));

        assertThat(saved).extracting(FinanceEntry::getAmount)
                .usingElementComparator(BigDecimal::compareTo)
                .containsExactlyInAnyOrder(new BigDecimal("50.01"), new BigDecimal("50.00"));
    }

    @Test
    void ausgabeKannNichtMitSichSelbstGeteiltWerden() {
        FinanceEntry entry = sharedExpense("600.00", "20");
        entry.setSharedWithUserId(entry.getCreatedBy());

        assertThatThrownBy(() -> service.create(entry))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void mehrfachesNormalisierenAendertNichts() {
        FinanceEntry entry = income("120.00", "20", VatCalculator.MODE_GROSS);

        service.normalize(entry);
        BigDecimal nachErstem = entry.getAmount();
        service.normalize(entry);
        service.normalize(entry);

        assertThat(entry.getAmount()).isEqualByComparingTo(nachErstem);
        assertThat(entry.getNetAmount()).isEqualByComparingTo("100.00");
    }

    // ── Validierung ───────────────────────────────────────────────────

    @Test
    void unbekannterUstSatzWirdAbgelehnt() {
        FinanceEntry entry = income("119.00", "19", VatCalculator.MODE_GROSS);

        assertThatThrownBy(() -> service.create(entry))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("USt-Satz");
    }

    @Test
    void nurAnzahlungenDuerfenVerknuepftWerden() {
        FinanceEntry entry = income("100.00", "0", VatCalculator.MODE_GROSS);
        entry.setKind(FinanceService.KIND_INVOICE);
        entry.setParentId(UUID.randomUUID());

        assertThatThrownBy(() -> service.create(entry))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Nur Anzahlungen");
    }

    @Test
    void anzahlungAufNichtExistierendeRechnungWirdAbgelehnt() {
        UUID fehlend = UUID.randomUUID();
        when(repository.findById(fehlend)).thenReturn(Optional.empty());

        FinanceEntry entry = income("100.00", "0", VatCalculator.MODE_GROSS);
        entry.setKind(FinanceService.KIND_DEPOSIT);
        entry.setParentId(fehlend);

        assertThatThrownBy(() -> service.create(entry))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("existiert nicht");
    }

    @Test
    void anzahlungAufAnzahlungWirdAbgelehnt() {
        UUID parentId = UUID.randomUUID();
        FinanceEntry parent = income("500.00", "0", VatCalculator.MODE_GROSS);
        parent.setKind(FinanceService.KIND_DEPOSIT);
        when(repository.findById(parentId)).thenReturn(Optional.of(parent));

        FinanceEntry entry = income("100.00", "0", VatCalculator.MODE_GROSS);
        entry.setKind(FinanceService.KIND_DEPOSIT);
        entry.setParentId(parentId);

        assertThatThrownBy(() -> service.create(entry))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("nicht auf eine Anzahlung");
    }

    @Test
    void teilenMitSichSelbstWirdAbgelehnt() {
        UUID alice = UUID.randomUUID();
        FinanceEntry entry = income("100.00", "0", VatCalculator.MODE_GROSS);
        entry.setCreatedBy(alice);
        entry.setSharedWithUserId(alice);

        assertThatThrownBy(() -> service.create(entry))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("mit sich selbst");
    }

    // ── Aufteilung in zwei Buchungen ──────────────────────────────────

    /**
     * Der steuerlich richtige Ablauf zwischen zwei Einzelunternehmern: alice
     * fakturiert dem Kunden voll, bob stellt ihr seinen Anteil in Rechnung,
     * alice zieht dessen USt als Vorsteuer ab.
     */
    @Test
    void geteilteEinnahmeErzeugtKundenrechnungAnteilUndGegenbuchung() {
        UUID alice = UUID.randomUUID();
        UUID bob = UUID.randomUUID();

        FinanceEntry entry = income("1200.00", "20", VatCalculator.MODE_GROSS);
        entry.setCreatedBy(alice);
        entry.setCreatedByUsername("alice");
        entry.setSharedWithUserId(bob);
        entry.setSharedWithUsername("bob");

        List<FinanceEntry> saved = captureSaved(() -> service.create(entry));

        assertThat(saved).hasSize(3);

        FinanceEntry origin = byRole(saved, FinanceService.SPLIT_ORIGIN);
        FinanceEntry shareIn = byRole(saved, FinanceService.SPLIT_SHARE_IN);
        FinanceEntry shareOut = byRole(saved, FinanceService.SPLIT_SHARE_OUT);

        // Die Kundenrechnung bleibt ungekürzt bei alice
        assertThat(origin.getCreatedBy()).isEqualTo(alice);
        assertThat(origin.getAmount()).isEqualByComparingTo("1200.00");
        assertThat(origin.getVatAmount()).isEqualByComparingTo("200.00");

        // bobs Anteilsrechnung: seine Einnahme, seine USt-Schuld
        assertThat(shareIn.getCreatedBy()).isEqualTo(bob);
        assertThat(shareIn.getType()).isEqualTo(FinanceService.TYPE_INCOME);
        assertThat(shareIn.getAmount()).isEqualByComparingTo("600.00");
        assertThat(shareIn.getVatAmount()).isEqualByComparingTo("100.00");

        // Dieselbe Rechnung bei alice als Aufwand mit abziehbarer Vorsteuer
        assertThat(shareOut.getCreatedBy()).isEqualTo(alice);
        assertThat(shareOut.getType()).isEqualTo(FinanceService.TYPE_EXPENSE);
        assertThat(shareOut.getAmount()).isEqualByComparingTo("600.00");
        assertThat(shareOut.getVatAmount()).isEqualByComparingTo("100.00");
        assertThat(shareOut.getVatDeductible()).isTrue();
    }

    @Test
    void dieInterneAnteilsrechnungIstZunaechstOffen() {
        List<FinanceEntry> saved = captureSaved(() -> service.create(sharedIncome("1200.00", "20")));

        assertThat(byRole(saved, FinanceService.SPLIT_SHARE_IN).getStatus())
                .isEqualTo(FinanceService.STATUS_SENT);
        assertThat(byRole(saved, FinanceService.SPLIT_SHARE_OUT).getStatus())
                .isEqualTo(FinanceService.STATUS_SENT);
    }

    @Test
    void alleDreiBuchungenTragenDieselbeGruppe() {
        List<FinanceEntry> saved = captureSaved(() -> service.create(sharedIncome("1000.00", "0")));

        assertThat(saved).extracting(FinanceEntry::getSplitGroupId).doesNotContainNull();
        assertThat(saved).extracting(FinanceEntry::getSplitGroupId).containsOnly(saved.getFirst().getSplitGroupId());
    }

    @Test
    void dieAnteilsbuchungenNennenDieGegenseiteImText() {
        List<FinanceEntry> saved = captureSaved(() -> service.create(sharedIncome("1000.00", "0")));

        assertThat(byRole(saved, FinanceService.SPLIT_SHARE_IN).getDescription())
                .isEqualTo("Test — Anteil von alice");
        assertThat(byRole(saved, FinanceService.SPLIT_SHARE_OUT).getDescription())
                .isEqualTo("Test — Anteil an bob");
    }

    /**
     * Kernpunkt der Aufteilung: was der eine an USt schuldet, setzt der andere
     * als Vorsteuer an. Sonst wäre die USt doppelt beim Finanzamt.
     */
    @Test
    void dieUstDesPartnersIstDieVorsteuerDesErstellers() {
        List<FinanceEntry> saved = captureSaved(() -> service.create(sharedIncome("1200.00", "20")));

        BigDecimal partnerUst = byRole(saved, FinanceService.SPLIT_SHARE_IN).getVatAmount();
        FinanceEntry gegenbuchung = byRole(saved, FinanceService.SPLIT_SHARE_OUT);

        assertThat(gegenbuchung.getVatAmount()).isEqualByComparingTo(partnerUst);
        assertThat(gegenbuchung.getVatDeductible()).isTrue();
    }

    @Test
    void diePartnerangabeWirdNichtMitgespeichert() {
        UUID alice = UUID.randomUUID();
        FinanceEntry entry = income("1000.00", "0", VatCalculator.MODE_GROSS);
        entry.setCreatedBy(alice);
        entry.setCreatedByUsername("alice");
        entry.setSharedWithUserId(UUID.randomUUID());
        entry.setSharedWithUsername("bob");

        List<FinanceEntry> saved = captureSaved(() -> service.create(entry));

        assertThat(saved).extracting(FinanceEntry::getSharedWithUserId).containsOnlyNulls();
    }

    @Test
    void derAnteilIstDieHaelfteDerKundenrechnung() {
        List<FinanceEntry> saved = captureSaved(() -> service.create(sharedIncome("1000.01", "0")));

        BigDecimal voll = byRole(saved, FinanceService.SPLIT_ORIGIN).getAmount();
        BigDecimal anteil = byRole(saved, FinanceService.SPLIT_SHARE_IN).getAmount();

        assertThat(voll).isEqualByComparingTo("1000.01");
        assertThat(anteil).isEqualByComparingTo("500.01");
        // Beide Seiten der internen Rechnung müssen exakt gleich hoch sein
        assertThat(byRole(saved, FinanceService.SPLIT_SHARE_OUT).getAmount()).isEqualByComparingTo(anteil);
    }

    @Test
    void derKundeWirdAufAlleBuchungenUebernommen() {
        UUID kunde = UUID.randomUUID();
        FinanceEntry entry = sharedIncome("1000.00", "0");
        entry.setCustomerId(kunde);
        entry.setCustomerName("Acme Corp");

        List<FinanceEntry> saved = captureSaved(() -> service.create(entry));

        assertThat(saved).allSatisfy(e -> assertThat(e.getCustomerId()).isEqualTo(kunde));
    }

    /** Die Kundenrechnung hängt am Beleg — die interne Verrechnung nicht. */
    @Test
    void derRechnungsanhangBleibtAnDerKundenrechnung() {
        FinanceEntry entry = sharedIncome("1000.00", "0");
        entry.setAttachmentPath("Rechnungen/RE-004.pdf");
        entry.setAttachmentName("RE-004.pdf");

        List<FinanceEntry> saved = captureSaved(() -> service.create(entry));

        assertThat(byRole(saved, FinanceService.SPLIT_ORIGIN).getAttachmentName()).isEqualTo("RE-004.pdf");
        assertThat(byRole(saved, FinanceService.SPLIT_SHARE_IN).getAttachmentName()).isNull();
    }

    @Test
    void ausgabeOhnePartnerangabeBleibtEineBuchung() {
        FinanceEntry entry = expense("120.00", "20");

        List<FinanceEntry> saved = captureSaved(() -> service.create(entry));

        assertThat(saved).hasSize(1);
        assertThat(saved.getFirst().getSplitGroupId()).isNull();
    }

    // ── Wem der Eintrag gehoert ───────────────────────────────────────

    /**
     * Der Kern: wer tippt, ist nicht wer es zu versteuern hat. Ohne diese
     * Trennung verschob ein fremd eingetippter Eintrag Umsatz, Gewinn und damit
     * die SVS- und Kleinunternehmergrenze der falschen Person.
     */
    @Test
    void derEintragLaesstSichEinerAnderenPersonZuschreiben() {
        UUID id = UUID.randomUUID();
        UUID simeon = UUID.randomUUID();
        UUID hanxi = UUID.randomUUID();

        FinanceEntry entry = income("1200.00", "20", VatCalculator.MODE_GROSS);
        entry.setCreatedBy(simeon);
        entry.setCreatedByUsername("simeon");
        when(repository.findById(id)).thenReturn(Optional.of(entry));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        FinanceEntry aenderung = income("1200.00", "20", VatCalculator.MODE_GROSS);
        aenderung.setOwnerId(hanxi);
        aenderung.setOwnerUsername("hanxi");

        FinanceEntry result = service.update(id, aenderung);

        assertThat(result.ownerId()).isEqualTo(hanxi);
        assertThat(result.ownerName()).isEqualTo("hanxi");
        assertThat(result.getCreatedBy())
                .as("wer es eingetippt hat, bleibt als Protokoll erhalten")
                .isEqualTo(simeon);
    }

    /** Altbestand ohne ausdruecklichen Eigentuemer zaehlt weiter auf den Ersteller. */
    @Test
    void ohneAngabeGiltWeiterhinDerErsteller() {
        UUID simeon = UUID.randomUUID();
        FinanceEntry entry = income("1200.00", "20", VatCalculator.MODE_GROSS);
        entry.setCreatedBy(simeon);
        entry.setCreatedByUsername("simeon");

        assertThat(entry.ownerId()).isEqualTo(simeon);
        assertThat(entry.ownerName()).isEqualTo("simeon");
    }

    /**
     * Ein Statuswechsel oder eine Betragskorrektur darf die Zurechnung nicht
     * anfassen — sonst schriebe jede Bearbeitung den Eintrag still um.
     */
    @Test
    void einUpdateOhneAngabeLaesstDenEigentuemerInRuhe() {
        UUID id = UUID.randomUUID();
        UUID simeon = UUID.randomUUID();
        UUID hanxi = UUID.randomUUID();

        FinanceEntry entry = income("1200.00", "20", VatCalculator.MODE_GROSS);
        entry.setCreatedBy(simeon);
        entry.setOwnerId(hanxi);
        entry.setOwnerUsername("hanxi");
        when(repository.findById(id)).thenReturn(Optional.of(entry));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        FinanceEntry aenderung = income("1500.00", "20", VatCalculator.MODE_GROSS);

        assertThat(service.update(id, aenderung).ownerId()).isEqualTo(hanxi);
    }

    /**
     * Zu zweit gibt es als neuen Eigentuemer nur den Partner — die Aufteilung
     * fiele damit in sich zusammen und jemand rechnete mit sich selbst ab.
     */
    @Test
    void eineGeteilteBuchungLaesstSichNichtUmschreiben() {
        UUID id = UUID.randomUUID();
        UUID simeon = UUID.randomUUID();
        UUID hanxi = UUID.randomUUID();

        FinanceEntry entry = income("1200.00", "20", VatCalculator.MODE_GROSS);
        entry.setCreatedBy(simeon);
        entry.setSplitGroupId(UUID.randomUUID());
        entry.setSplitRole("ORIGIN");
        when(repository.findById(id)).thenReturn(Optional.of(entry));

        FinanceEntry aenderung = income("1200.00", "20", VatCalculator.MODE_GROSS);
        aenderung.setOwnerId(hanxi);
        aenderung.setOwnerUsername("hanxi");

        assertThatThrownBy(() -> service.update(id, aenderung))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Aufteilung aufloesen");
    }

    // ── Status direkt umschalten ──────────────────────────────────────

    @Test
    void statusLaesstSichEinzelnUmschalten() {
        UUID id = UUID.randomUUID();
        FinanceEntry entry = income("1200.00", "20", VatCalculator.MODE_GROSS);
        entry.setStatus(FinanceService.STATUS_SENT);
        when(repository.findById(id)).thenReturn(Optional.of(entry));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        FinanceEntry result = service.updateStatus(id, FinanceService.STATUS_PAID, null);

        assertThat(result.getStatus()).isEqualTo(FinanceService.STATUS_PAID);
    }

    /** Der eigentliche Grund für den eigenen Endpunkt. */
    @Test
    void beimStatuswechselBleibenKundeUndAnhangErhalten() {
        UUID id = UUID.randomUUID();
        UUID kunde = UUID.randomUUID();
        FinanceEntry entry = income("1200.00", "20", VatCalculator.MODE_GROSS);
        entry.setStatus(FinanceService.STATUS_SENT);
        entry.setCustomerId(kunde);
        entry.setCustomerName("Acme Corp");
        entry.setAttachmentPath("Rechnungen/RE-004.pdf");
        entry.setAttachmentName("RE-004.pdf");
        when(repository.findById(id)).thenReturn(Optional.of(entry));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        FinanceEntry result = service.updateStatus(id, FinanceService.STATUS_PAID, null);

        assertThat(result.getCustomerId()).isEqualTo(kunde);
        assertThat(result.getCustomerName()).isEqualTo("Acme Corp");
        assertThat(result.getAttachmentName()).isEqualTo("RE-004.pdf");
    }

    @Test
    void ausEinerAnzahlungWiederEineRechnungZuMachenLoestDieVerknuepfung() {
        UUID id = UUID.randomUUID();
        FinanceEntry anzahlung = income("500.00", "0", VatCalculator.MODE_GROSS);
        anzahlung.setKind(FinanceService.KIND_DEPOSIT);
        anzahlung.setParentId(UUID.randomUUID());
        when(repository.findById(id)).thenReturn(Optional.of(anzahlung));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        FinanceEntry result = service.updateStatus(id, FinanceService.STATUS_PAID, FinanceService.KIND_INVOICE);

        assertThat(result.getKind()).isEqualTo(FinanceService.KIND_INVOICE);
        assertThat(result.getParentId())
                .as("eine Rechnung darf nicht mehr auf eine andere verweisen")
                .isNull();
    }

    @Test
    void unbekannterStatusWirdAbgelehnt() {
        UUID id = UUID.randomUUID();
        when(repository.findById(id)).thenReturn(Optional.of(income("100.00", "0", VatCalculator.MODE_GROSS)));

        assertThatThrownBy(() -> service.updateStatus(id, "IRGENDWAS", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unbekannter Status");
    }

    // ── Löschen ───────────────────────────────────────────────────────

    @Test
    void loeschenEinerBuchungEntferntDieGanzeAufteilung() {
        UUID id = UUID.randomUUID();
        UUID group = UUID.randomUUID();

        FinanceEntry origin = income("1200.00", "20", VatCalculator.MODE_GROSS);
        origin.setSplitGroupId(group);
        FinanceEntry shareIn = income("600.00", "20", VatCalculator.MODE_GROSS);
        shareIn.setSplitGroupId(group);
        FinanceEntry shareOut = expense("600.00", "20");
        shareOut.setSplitGroupId(group);

        when(repository.findById(id)).thenReturn(Optional.of(shareIn));
        when(repository.findBySplitGroupId(group)).thenReturn(List.of(origin, shareIn, shareOut));
        when(repository.countByParentId(any())).thenReturn(0L);

        service.delete(id);

        // Eine Anteilsbuchung ohne Gegenstück würde die Vorsteuer verfälschen
        verify(repository).deleteAll(List.of(origin, shareIn, shareOut));
    }

    @Test
    void rechnungMitAnzahlungenKannNichtGeloeschtWerden() {
        UUID id = UUID.randomUUID();
        FinanceEntry rechnung = income("3000.00", "0", VatCalculator.MODE_GROSS);
        when(repository.findById(id)).thenReturn(Optional.of(rechnung));
        when(repository.countByParentId(any())).thenReturn(2L);

        assertThatThrownBy(() -> service.delete(id))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("verknüpfte Anzahlungen");

        verify(repository, never()).deleteAll(any());
    }

    @Test
    void rechnungOhneAnzahlungenWirdGeloescht() {
        UUID id = UUID.randomUUID();
        FinanceEntry rechnung = income("500.00", "0", VatCalculator.MODE_GROSS);
        when(repository.findById(id)).thenReturn(Optional.of(rechnung));
        when(repository.countByParentId(any())).thenReturn(0L);

        service.delete(id);

        verify(repository).deleteAll(List.of(rechnung));
    }

    // ── Backfill ──────────────────────────────────────────────────────

    @Test
    void altdatenWerdenAlsBruttoMitNullProzentUebernommen() {
        FinanceEntry alt = new FinanceEntry();
        alt.setType(FinanceService.TYPE_INCOME);
        alt.setAmount(new BigDecimal("250.00"));
        alt.setDescription("Alteintrag");
        alt.setDate(LocalDate.of(2025, 3, 1));
        alt.setCreatedBy(UUID.randomUUID());
        when(repository.findNeedingBackfill()).thenReturn(java.util.List.of(alt));

        int count = service.backfillLegacyEntries();

        assertThat(count).isEqualTo(1);
        assertThat(alt.getNetAmount()).isEqualByComparingTo("250.00");
        assertThat(alt.getVatAmount()).isEqualByComparingTo("0.00");
        assertThat(alt.getVatRate()).isEqualByComparingTo("0");
        assertThat(alt.getKind()).isEqualTo(FinanceService.KIND_INVOICE);
        assertThat(alt.getStatus())
                .as("Altbestand ist abgeschlossen und darf nicht plötzlich als offen gelten")
                .isEqualTo(FinanceService.STATUS_PAID);
        verify(repository).saveAll(any());
    }

    @Test
    void backfillOhneAltdatenMachtNichts() {
        when(repository.findNeedingBackfill()).thenReturn(java.util.List.of());

        assertThat(service.backfillLegacyEntries()).isZero();
        verify(repository, never()).saveAll(any());
    }

    // ── Hilfsmittel ───────────────────────────────────────────────────

    private FinanceEntry create(FinanceEntry entry) {
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        return service.create(entry);
    }

    /** Sammelt alles ein, was der Service gespeichert hat — bei geteilten Einnahmen zwei Buchungen. */
    private List<FinanceEntry> captureSaved(Runnable action) {
        List<FinanceEntry> saved = new ArrayList<>();
        when(repository.save(any())).thenAnswer(inv -> {
            saved.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        action.run();
        return saved;
    }

    private static FinanceEntry income(String amount, String rate, String mode) {
        return entry(FinanceService.TYPE_INCOME, amount, rate, mode);
    }

    /** Einnahme von alice, zur Teilung mit bob markiert. */
    private static FinanceEntry sharedIncome(String amount, String rate) {
        FinanceEntry entry = income(amount, rate, VatCalculator.MODE_GROSS);
        entry.setCreatedBy(UUID.randomUUID());
        entry.setCreatedByUsername("alice");
        entry.setSharedWithUserId(UUID.randomUUID());
        entry.setSharedWithUsername("bob");
        return entry;
    }

    private static FinanceEntry byRole(List<FinanceEntry> entries, String role) {
        return entries.stream()
                .filter(e -> role.equals(e.getSplitRole()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Keine Buchung mit Rolle " + role));
    }

    /** Ausgabe von alice, zur Teilung mit bob markiert. */
    private static FinanceEntry sharedExpense(String amount, String rate) {
        FinanceEntry entry = expense(amount, rate);
        entry.setCreatedBy(UUID.randomUUID());
        entry.setCreatedByUsername("alice");
        entry.setSharedWithUserId(UUID.randomUUID());
        entry.setSharedWithUsername("bob");
        return entry;
    }

    private static FinanceEntry expense(String amount, String rate) {
        return entry(FinanceService.TYPE_EXPENSE, amount, rate, VatCalculator.MODE_GROSS);
    }

    private static FinanceEntry entry(String type, String amount, String rate, String mode) {
        FinanceEntry e = new FinanceEntry();
        e.setType(type);
        e.setAmount(new BigDecimal(amount));
        e.setVatRate(new BigDecimal(rate));
        e.setInputMode(mode);
        e.setDescription("Test");
        e.setDate(LocalDate.now());
        e.setCreatedBy(UUID.randomUUID());
        return e;
    }
}
