package com.collabcrm.service;

import com.collabcrm.model.Todo;
import com.collabcrm.model.TodoComment;
import com.collabcrm.repository.TodoCommentRepository;
import com.collabcrm.repository.TodoRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TodoServiceTest {

    @Mock
    private TodoRepository repository;

    @Mock
    private TodoCommentRepository commentRepository;

    @InjectMocks
    private TodoService service;

    // ── Kommentarzähler ───────────────────────────────────────────────

    @Test
    void dieListeBringtDieKommentarzaehlerMit() {
        Todo mitKommentaren = todo("Angebot schreiben");
        Todo ohne = todo("Rechnung prüfen");

        when(repository.findAll()).thenReturn(List.of(mitKommentaren, ohne));
        // Expliziter Typ: List.of(Object[]) wuerde sonst als varargs gelesen
        when(commentRepository.countGroupedByTodoId())
                .thenReturn(List.<Object[]>of(new Object[]{mitKommentaren.getId(), 3L}));

        List<Todo> result = service.findAll();

        assertThat(result.get(0).getCommentCount()).isEqualTo(3);
        assertThat(result.get(1).getCommentCount()).isZero();
    }

    /** Ein Zähler pro Todo waere eine Abfrage pro Zeile — es muss eine bleiben. */
    @Test
    void dieZaehlerKostenNurEineAbfrage() {
        when(repository.findAll())
                .thenReturn(List.of(todo("a"), todo("b"), todo("c")));
        when(commentRepository.countGroupedByTodoId()).thenReturn(List.of());

        service.findAll();

        verify(commentRepository, times(1)).countGroupedByTodoId();
    }

    // ── Kommentare ────────────────────────────────────────────────────

    @Test
    void kommentareHaengenAmTodo() {
        UUID todoId = UUID.randomUUID();
        when(repository.findById(todoId)).thenReturn(Optional.of(todo("Angebot")));
        when(commentRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        TodoComment comment = new TodoComment();
        comment.setText("hab die Zahlen geschickt");
        comment.setCreatedBy(UUID.randomUUID());

        TodoComment saved = service.addComment(todoId, comment);

        assertThat(saved.getTodoId()).isEqualTo(todoId);
        assertThat(saved.getText()).isEqualTo("hab die Zahlen geschickt");
    }

    @Test
    void kommentareZuEinemUnbekanntenTodoWerdenAbgelehnt() {
        UUID fehlend = UUID.randomUUID();
        when(repository.findById(fehlend)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.addComment(fehlend, new TodoComment()))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Todo not found");

        verify(commentRepository, never()).save(any());
    }

    @Test
    void mitDemTodoVerschwindenAuchSeineKommentare() {
        UUID id = UUID.randomUUID();

        service.delete(id);

        verify(commentRepository).deleteByTodoId(id);
        verify(repository).deleteById(id);
    }

    // ── Update-Semantik ───────────────────────────────────────────────

    /**
     * Der Server ersetzt das Todo vollständig. Das ist Absicht, damit sich
     * Fälligkeit, Notizen und Kundenverknüpfung wieder entfernen lassen — der
     * Client muss deshalb immer das ganze Todo senden.
     */
    @Test
    void einVollstaendigesUpdateBehaeltAlleFelder() {
        UUID id = UUID.randomUUID();
        UUID kunde = UUID.randomUUID();
        Todo existing = todo("Angebot");
        existing.setDueDate(LocalDate.of(2026, 8, 20));
        existing.setNotes("Zahlen von bob abwarten");
        existing.setCustomerId(kunde);
        existing.setCustomerName("Acme Corp");
        existing.setDone(false);

        Todo update = todo("Angebot");
        update.setDueDate(existing.getDueDate());
        update.setNotes(existing.getNotes());
        update.setCustomerId(kunde);
        update.setCustomerName("Acme Corp");
        update.setDone(true);

        when(repository.findById(id)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Todo result = service.update(id, update);

        assertThat(result.isDone()).isTrue();
        assertThat(result.getDueDate()).isEqualTo(LocalDate.of(2026, 8, 20));
        assertThat(result.getNotes()).isEqualTo("Zahlen von bob abwarten");
        assertThat(result.getCustomerId()).isEqualTo(kunde);
    }

    @Test
    void dieKundenverknuepfungLaesstSichWiederEntfernen() {
        UUID id = UUID.randomUUID();
        Todo existing = todo("Angebot");
        existing.setCustomerId(UUID.randomUUID());
        existing.setCustomerName("Acme Corp");

        when(repository.findById(id)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Todo result = service.update(id, todo("Angebot"));

        assertThat(result.getCustomerId()).isNull();
        assertThat(result.getCustomerName()).isNull();
    }

    // ── Wiederkehrende Todos ──────────────────────────────────────────

    @Test
    void abhakenLegtDenNaechstenDurchlaufAn() {
        UUID id = UUID.randomUUID();
        Todo monatlich = recurring("UVA einreichen", "MONTHLY", LocalDate.of(2026, 8, 15));
        when(repository.findById(id)).thenReturn(Optional.of(monatlich));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        List<Todo> saved = captureSaved(() -> service.update(id, abgehakt(monatlich)));

        Todo nachfolger = saved.stream()
                .filter(t -> !t.isDone() && t != monatlich)
                .findFirst().orElseThrow();

        assertThat(nachfolger.getTitle()).isEqualTo("UVA einreichen");
        assertThat(nachfolger.getDueDate()).isEqualTo(LocalDate.of(2026, 9, 15));
        assertThat(nachfolger.getRecurrence()).isEqualTo("MONTHLY");
        assertThat(nachfolger.isDone()).isFalse();
    }

    @Test
    void einNichtWiederkehrendesTodoBekommtKeinenNachfolger() {
        UUID id = UUID.randomUUID();
        Todo einmalig = todo("Einmalige Sache");
        einmalig.setDueDate(LocalDate.of(2026, 8, 15));
        when(repository.findById(id)).thenReturn(Optional.of(einmalig));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        List<Todo> saved = captureSaved(() -> service.update(id, abgehakt(einmalig)));

        assertThat(saved).hasSize(1);
    }

    /** Beide Wege — Abhaken und Zeitplan — duerfen zusammen nur einen erzeugen. */
    @Test
    void esEntstehtGenauEinNachfolger() {
        Todo monatlich = recurring("UVA einreichen", "MONTHLY", LocalDate.of(2026, 8, 15));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        assertThat(service.spawnNextOccurrence(monatlich)).isPresent();
        assertThat(service.spawnNextOccurrence(monatlich))
                .as("beim zweiten Versuch nicht noch einmal")
                .isEmpty();
    }

    /**
     * Bleibt ein wiederkehrendes Todo liegen, muss der naechste Durchlauf
     * trotzdem kommen — sonst verschluckt eine vergessene UVA die naechste.
     */
    @Test
    void einLiegengebliebenesWiederholtSichTrotzdem() {
        Todo faellig = recurring("UVA einreichen", "MONTHLY", LocalDate.of(2026, 8, 15));
        Todo nochNichtFaellig = recurring("SVS", "QUARTERLY", LocalDate.of(2026, 9, 30));
        when(repository.findAll()).thenReturn(List.of(faellig, nochNichtFaellig));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        int angelegt = service.spawnOverdueRecurrences(LocalDate.of(2026, 8, 20));

        assertThat(angelegt).isEqualTo(1);
        assertThat(faellig.getRecurrenceSpawned()).isTrue();
        assertThat(nochNichtFaellig.getRecurrenceSpawned()).isNull();
    }

    @Test
    void derNaechsteTerminRichtetSichNachDerAltenFristNichtNachHeute() {
        assertThat(TodoService.nextDueDate(LocalDate.of(2026, 8, 15), "DAILY"))
                .isEqualTo(LocalDate.of(2026, 8, 16));
        assertThat(TodoService.nextDueDate(LocalDate.of(2026, 8, 15), "WEEKLY"))
                .isEqualTo(LocalDate.of(2026, 8, 22));
        assertThat(TodoService.nextDueDate(LocalDate.of(2026, 8, 15), "MONTHLY"))
                .isEqualTo(LocalDate.of(2026, 9, 15));
        assertThat(TodoService.nextDueDate(LocalDate.of(2026, 8, 15), "QUARTERLY"))
                .isEqualTo(LocalDate.of(2026, 11, 15));
        assertThat(TodoService.nextDueDate(LocalDate.of(2026, 8, 15), "YEARLY"))
                .isEqualTo(LocalDate.of(2027, 8, 15));
    }

    /** Der 31. wird im kuerzeren Monat zum Monatsletzten, nicht zum Ersten danach. */
    @Test
    void einMonatsletzterSpringtNichtInDenFolgemonat() {
        assertThat(TodoService.nextDueDate(LocalDate.of(2026, 1, 31), "MONTHLY"))
                .isEqualTo(LocalDate.of(2026, 2, 28));
    }

    @Test
    void ohneFaelligkeitGibtEsKeineWiederholung() {
        Todo ohneFrist = recurring("Ohne Datum", "MONTHLY", null);
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        assertThat(service.spawnNextOccurrence(ohneFrist)).isEmpty();
    }

    // ── Reihenfolge ───────────────────────────────────────────────────

    /** Die von Hand gelegte Reihenfolge schlaegt das Anlagedatum. */
    @Test
    void dieListeFolgtDerGelegtenReihenfolge() {
        Todo erstes = platziert("Zuerst", 0, stunden(1));
        Todo zweites = platziert("Dann", 1, stunden(3));
        Todo drittes = platziert("Zuletzt", 2, stunden(2));
        when(repository.findAll()).thenReturn(List.of(drittes, erstes, zweites));
        when(commentRepository.countGroupedByTodoId()).thenReturn(List.of());

        assertThat(service.findAll())
                .extracting(Todo::getTitle)
                .containsExactly("Zuerst", "Dann", "Zuletzt");
    }

    @Test
    void erledigtesStehtImmerHinterOffenem() {
        Todo offen = platziert("Offen", 5, stunden(1));
        Todo erledigt = platziert("Erledigt", 0, stunden(1));
        erledigt.setDone(true);
        when(repository.findAll()).thenReturn(List.of(erledigt, offen));
        when(commentRepository.countGroupedByTodoId()).thenReturn(List.of());

        assertThat(service.findAll())
                .extracting(Todo::getTitle)
                .containsExactly("Offen", "Erledigt");
    }

    /**
     * Solange niemand etwas verschoben hat, soll die Liste aussehen wie vorher:
     * neueste zuerst.
     */
    @Test
    void nochNieEinsortiertesBleibtBeiNeuesteZuerst() {
        Todo alt = platziert("Alt", null, stunden(5));
        Todo neu = platziert("Neu", null, stunden(1));
        when(repository.findAll()).thenReturn(List.of(alt, neu));
        when(commentRepository.countGroupedByTodoId()).thenReturn(List.of());

        assertThat(service.findAll())
                .extracting(Todo::getTitle)
                .containsExactly("Neu", "Alt");
    }

    /** Gemischt: was einen Platz hat, steht vor dem, was nie einsortiert wurde. */
    @Test
    void einsortiertesStehtVorNichtEinsortiertem() {
        Todo ohnePlatz = platziert("Ohne Platz", null, stunden(1));
        Todo mitPlatz = platziert("Mit Platz", 9, stunden(9));
        when(repository.findAll()).thenReturn(List.of(ohnePlatz, mitPlatz));
        when(commentRepository.countGroupedByTodoId()).thenReturn(List.of());

        assertThat(service.findAll())
                .extracting(Todo::getTitle)
                .containsExactly("Mit Platz", "Ohne Platz");
    }

    @Test
    void neuAufgeschriebenesLandetGanzOben() {
        Todo vorhanden = platziert("Vorhanden", 0, stunden(1));
        when(repository.findAll()).thenReturn(List.of(vorhanden));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Todo neu = service.create(todo("Ganz neu"));

        assertThat(neu.getPosition()).isLessThan(vorhanden.getPosition());
    }

    @Test
    void aufLeererListeBekommtDasErsteEinenPlatz() {
        when(repository.findAll()).thenReturn(List.of());
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        assertThat(service.create(todo("Das erste")).getPosition()).isZero();
    }

    // ── Umsortieren ───────────────────────────────────────────────────

    @Test
    void umsortierenZaehltDiePlaetzeVonObenDurch() {
        Todo a = platziert("A", 0, stunden(1));
        Todo b = platziert("B", 1, stunden(1));
        Todo c = platziert("C", 2, stunden(1));
        when(repository.findAllById(any())).thenReturn(List.of(a, b, c));

        service.reorder(List.of(c.getId(), a.getId(), b.getId()));

        assertThat(c.getPosition()).isZero();
        assertThat(a.getPosition()).isEqualTo(1);
        assertThat(b.getPosition()).isEqualTo(2);
    }

    /** Nur was sich wirklich verschiebt, wird geschrieben. */
    @Test
    void unveraenderteBleibenUngespeichert() {
        Todo a = platziert("A", 0, stunden(1));
        Todo b = platziert("B", 1, stunden(1));
        when(repository.findAllById(any())).thenReturn(List.of(a, b));

        assertThat(service.reorder(List.of(a.getId(), b.getId()))).isZero();
    }

    /**
     * Ein Client mit veraltetem Stand schickt womoeglich eine ID, die es nicht
     * mehr gibt. Das darf die Anfrage nicht scheitern lassen — und es darf auch
     * keine Luecke in der Nummerierung hinterlassen, sonst waechst der Abstand
     * mit jedem geloeschten Todo weiter.
     */
    @Test
    void unbekannteIdsWerdenUebergangenOhneLueckeZuHinterlassen() {
        Todo a = platziert("A", 5, stunden(1));
        Todo b = platziert("B", 6, stunden(2));
        when(repository.findAllById(any())).thenReturn(List.of(a, b));

        service.reorder(List.of(UUID.randomUUID(), a.getId(), UUID.randomUUID(), b.getId()));

        assertThat(a.getPosition()).isZero();
        assertThat(b.getPosition()).isEqualTo(1);
    }

    @Test
    void eineLeereReihenfolgeAendertNichts() {
        assertThat(service.reorder(List.of())).isZero();
        assertThat(service.reorder(null)).isZero();
        verify(repository, never()).saveAll(any());
    }

    /** Ein wiederkehrendes Todo soll nicht jedes Mal woanders auftauchen. */
    @Test
    void derNachfolgerUebernimmtDenPlatzDesVorgaengers() {
        Todo monatlich = recurring("UVA einreichen", "MONTHLY", LocalDate.of(2026, 8, 15));
        monatlich.setPosition(3);
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        assertThat(service.spawnNextOccurrence(monatlich).orElseThrow().getPosition())
                .isEqualTo(3);
    }

    // ── Wartet auf Kunden ─────────────────────────────────────────────

    @Test
    void derWartezustandLaesstSichSetzenUndWiederLoesen() {
        UUID id = UUID.randomUUID();
        Todo existing = todo("Angebot");
        when(repository.findById(id)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Todo wartend = todo("Angebot");
        wartend.setWaiting(true);
        assertThat(service.update(id, wartend).waitsOnCustomer()).isTrue();

        Todo wiederDran = todo("Angebot");
        wiederDran.setWaiting(false);
        assertThat(service.update(id, wiederDran).waitsOnCustomer()).isFalse();
    }

    /** Wer abhakt, wartet nicht mehr — sonst bliebe der Zustand als Leiche zurueck. */
    @Test
    void abhakenBeendetDasWarten() {
        UUID id = UUID.randomUUID();
        Todo existing = todo("Angebot");
        existing.setWaiting(true);
        when(repository.findById(id)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Todo update = todo("Angebot");
        update.setWaiting(true);
        update.setDone(true);

        Todo result = service.update(id, update);

        assertThat(result.isDone()).isTrue();
        assertThat(result.waitsOnCustomer()).isFalse();
        assertThat(result.getWaiting()).isNull();
    }

    @Test
    void ohneAngabeWartetNichts() {
        assertThat(todo("Angebot").waitsOnCustomer()).isFalse();
    }

    // ── Hilfsmittel ───────────────────────────────────────────────────

    private static java.time.Instant stunden(int vor) {
        return java.time.Instant.parse("2026-08-14T12:00:00Z").minusSeconds(vor * 3600L);
    }

    private static Todo platziert(String title, Integer position, java.time.Instant createdAt) {
        Todo t = todo(title);
        t.setPosition(position);
        t.setCreatedAt(createdAt);
        return t;
    }

    private static Todo recurring(String title, String recurrence, LocalDate due) {
        Todo t = todo(title);
        t.setRecurrence(recurrence);
        t.setDueDate(due);
        return t;
    }

    /** Kopie des Todos mit gesetztem Haken, so wie das Frontend sie schickt. */
    private static Todo abgehakt(Todo original) {
        Todo update = new Todo();
        update.setTitle(original.getTitle());
        update.setDueDate(original.getDueDate());
        update.setRecurrence(original.getRecurrence());
        update.setDone(true);
        return update;
    }

    private List<Todo> captureSaved(Runnable action) {
        List<Todo> saved = new java.util.ArrayList<>();
        when(repository.save(any())).thenAnswer(inv -> {
            saved.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        action.run();
        return saved;
    }

    private static Todo todo(String title) {
        Todo t = new Todo();
        ReflectionTestUtils.setField(t, "id", UUID.randomUUID());
        t.setTitle(title);
        t.setCreatedBy(UUID.randomUUID());
        return t;
    }
}
