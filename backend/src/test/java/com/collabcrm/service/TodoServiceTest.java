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

        when(repository.findAllByOrderByDoneAscCreatedAtDesc()).thenReturn(List.of(mitKommentaren, ohne));
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
        when(repository.findAllByOrderByDoneAscCreatedAtDesc())
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
        update.setPriority("HIGH");
        update.setDueDate(existing.getDueDate());
        update.setNotes(existing.getNotes());
        update.setCustomerId(kunde);
        update.setCustomerName("Acme Corp");
        update.setDone(true);

        when(repository.findById(id)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Todo result = service.update(id, update);

        assertThat(result.getPriority()).isEqualTo("HIGH");
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

    private static Todo todo(String title) {
        Todo t = new Todo();
        ReflectionTestUtils.setField(t, "id", UUID.randomUUID());
        t.setTitle(title);
        t.setPriority("MEDIUM");
        t.setCreatedBy(UUID.randomUUID());
        return t;
    }
}
