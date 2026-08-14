package com.collabcrm.controller;

import com.collabcrm.model.Todo;
import com.collabcrm.service.FinanceStatsService;
import com.collabcrm.service.PresenceService;
import com.collabcrm.service.TodoService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(DashboardController.class)
// Prueft Controller-Logik, nicht die Anmeldung — die hat eigene Tests.
@AutoConfigureMockMvc(addFilters = false)
class DashboardControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private TodoService todoService;

    @MockitoBean
    private FinanceStatsService financeStatsService;

    @MockitoBean
    private PresenceService presenceService;

    private void givenFinance(List<Map<String, Object>> open, List<Map<String, Object>> perUser) {
        when(financeStatsService.openReceivables()).thenReturn(open);
        when(financeStatsService.stats(anyInt())).thenReturn(Map.of("perUser", perUser));
    }

    @Test
    void nurOffeneTodosLandenAufDemDashboard() throws Exception {
        when(todoService.findAll()).thenReturn(List.of(
                todo("Angebot schreiben", false),
                todo("Schon erledigt", true)));
        givenFinance(List.of(), List.of());

        mockMvc.perform(get("/api/dashboard/stats"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.openTodos.length()").value(1))
                .andExpect(jsonPath("$.openTodos[0].title").value("Angebot schreiben"))
                .andExpect(jsonPath("$.openTodoCount").value(1));
    }

    /**
     * Die auf der Todo-Seite gelegte Reihenfolge ist die Antwort auf "womit
     * fange ich an" — das Dashboard darf sie nicht umsortieren.
     */
    @Test
    void dieGelegteReihenfolgeBleibtErhalten() throws Exception {
        when(todoService.findAll()).thenReturn(List.of(
                todo("Zuerst", false),
                todo("Dann", false),
                todo("Zuletzt", false)));
        givenFinance(List.of(), List.of());

        mockMvc.perform(get("/api/dashboard/stats"))
                .andExpect(jsonPath("$.openTodos[0].title").value("Zuerst"))
                .andExpect(jsonPath("$.openTodos[1].title").value("Dann"))
                .andExpect(jsonPath("$.openTodos[2].title").value("Zuletzt"));
    }

    /** Wartendes ist offen, aber nicht dran — es darf die ersten Plaetze nicht belegen. */
    @Test
    void wartendesRutschtAnsEnde() throws Exception {
        Todo wartend = todo("Wartet auf Acme", false);
        wartend.setWaiting(true);

        when(todoService.findAll()).thenReturn(List.of(wartend, todo("Kann ich machen", false)));
        givenFinance(List.of(), List.of());

        mockMvc.perform(get("/api/dashboard/stats"))
                .andExpect(jsonPath("$.openTodos[0].title").value("Kann ich machen"))
                .andExpect(jsonPath("$.openTodos[1].title").value("Wartet auf Acme"))
                .andExpect(jsonPath("$.openTodos[1].waiting").value(true))
                .andExpect(jsonPath("$.waitingTodoCount").value(1));
    }

    @Test
    void abgehakteWartenNichtMehr() throws Exception {
        Todo erledigtUndWartend = todo("Erledigt", true);
        erledigtUndWartend.setWaiting(true);

        when(todoService.findAll()).thenReturn(List.of(erledigtUndWartend, todo("Offen", false)));
        givenFinance(List.of(), List.of());

        mockMvc.perform(get("/api/dashboard/stats"))
                .andExpect(jsonPath("$.openTodoCount").value(1))
                .andExpect(jsonPath("$.waitingTodoCount").value(0));
    }

    /** Die Liste wird gekürzt, die Gesamtzahl muss trotzdem stimmen. */
    @Test
    void dieGesamtzahlZaehltAuchDieNichtGezeigten() throws Exception {
        List<Todo> viele = java.util.stream.IntStream.range(0, 20)
                .mapToObj(i -> todo("Todo " + i, false))
                .toList();
        when(todoService.findAll()).thenReturn(viele);
        givenFinance(List.of(), List.of());

        mockMvc.perform(get("/api/dashboard/stats"))
                .andExpect(jsonPath("$.openTodos.length()").value(8))
                .andExpect(jsonPath("$.openTodoCount").value(20));
    }

    @Test
    void offeneRechnungenWerdenAufsummiert() throws Exception {
        when(todoService.findAll()).thenReturn(List.of());
        givenFinance(
                List.of(invoice("Projekt A", "1200.00"), invoice("Projekt B", "800.00")),
                List.of());

        mockMvc.perform(get("/api/dashboard/stats"))
                .andExpect(jsonPath("$.openInvoiceCount").value(2))
                .andExpect(jsonPath("$.openInvoiceTotal").value(2000.00));
    }

    @Test
    void derGewinnStehtProPersonUndAbsteigend() throws Exception {
        when(todoService.findAll()).thenReturn(List.of());
        givenFinance(List.of(), List.of(
                perUser("bob", "500.00"),
                perUser("alice", "1500.00")));

        mockMvc.perform(get("/api/dashboard/stats"))
                .andExpect(jsonPath("$.perUser[0].username").value("alice"))
                .andExpect(jsonPath("$.perUser[0].profit").value(1500.00))
                .andExpect(jsonPath("$.perUser[1].username").value("bob"));
    }

    @Test
    void anwesenheitWirdDurchgereicht() throws Exception {
        when(todoService.findAll()).thenReturn(List.of());
        givenFinance(List.of(), List.of());
        when(presenceService.getAllUsersPresence()).thenReturn(List.of(
                Map.of("userId", UUID.randomUUID().toString(), "username", "alice", "online", true)));

        mockMvc.perform(get("/api/dashboard/stats"))
                .andExpect(jsonPath("$.onlineUsers[0].username").value("alice"))
                .andExpect(jsonPath("$.onlineUsers[0].online").value(true));
    }

    @Test
    void ohneDatenKommenLeereListenStattFehler() throws Exception {
        when(todoService.findAll()).thenReturn(List.of());
        givenFinance(List.of(), List.of());

        mockMvc.perform(get("/api/dashboard/stats"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.openTodos").isEmpty())
                .andExpect(jsonPath("$.openInvoices").isEmpty())
                .andExpect(jsonPath("$.perUser").isEmpty())
                .andExpect(jsonPath("$.openInvoiceTotal").value(0));
    }

    // ── Hilfsmittel ───────────────────────────────────────────────────

    private static Todo todo(String title, boolean done) {
        Todo t = new Todo();
        ReflectionTestUtils.setField(t, "id", UUID.randomUUID());
        t.setTitle(title);
        t.setDone(done);
        t.setCreatedBy(UUID.randomUUID());
        t.setCreatedAt(Instant.now());
        return t;
    }

    private static Map<String, Object> invoice(String description, String open) {
        return Map.of(
                "id", UUID.randomUUID().toString(),
                "description", description,
                "date", "2026-08-01",
                "open", new BigDecimal(open));
    }

    private static Map<String, Object> perUser(String username, String profit) {
        return Map.of(
                "userId", UUID.randomUUID().toString(),
                "username", username,
                "profit", new BigDecimal(profit),
                "revenueGross", new BigDecimal("2000.00"),
                "openReceivables", BigDecimal.ZERO);
    }
}
