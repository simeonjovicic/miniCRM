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
                todo("Angebot schreiben", "HIGH", false),
                todo("Schon erledigt", "HIGH", true)));
        givenFinance(List.of(), List.of());

        mockMvc.perform(get("/api/dashboard/stats"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.openTodos.length()").value(1))
                .andExpect(jsonPath("$.openTodos[0].title").value("Angebot schreiben"))
                .andExpect(jsonPath("$.openTodoCount").value(1));
    }

    @Test
    void dringendeTodosStehenOben() throws Exception {
        when(todoService.findAll()).thenReturn(List.of(
                todo("Irgendwann", "LOW", false),
                todo("Dringend", "HIGH", false),
                todo("Mittelmässig", "MEDIUM", false)));
        givenFinance(List.of(), List.of());

        mockMvc.perform(get("/api/dashboard/stats"))
                .andExpect(jsonPath("$.openTodos[0].title").value("Dringend"))
                .andExpect(jsonPath("$.openTodos[1].title").value("Mittelmässig"))
                .andExpect(jsonPath("$.openTodos[2].title").value("Irgendwann"));
    }

    @Test
    void beiGleicherDringlichkeitZaehltDieNaechsteFrist() throws Exception {
        Todo spaeter = todo("Spaeter faellig", "HIGH", false);
        spaeter.setDueDate(LocalDate.of(2026, 12, 1));
        Todo bald = todo("Bald faellig", "HIGH", false);
        bald.setDueDate(LocalDate.of(2026, 8, 15));
        Todo ohneFrist = todo("Ohne Frist", "HIGH", false);

        when(todoService.findAll()).thenReturn(List.of(spaeter, ohneFrist, bald));
        givenFinance(List.of(), List.of());

        mockMvc.perform(get("/api/dashboard/stats"))
                .andExpect(jsonPath("$.openTodos[0].title").value("Bald faellig"))
                .andExpect(jsonPath("$.openTodos[1].title").value("Spaeter faellig"))
                .andExpect(jsonPath("$.openTodos[2].title").value("Ohne Frist"));
    }

    /** Die Liste wird gekürzt, die Gesamtzahl muss trotzdem stimmen. */
    @Test
    void dieGesamtzahlZaehltAuchDieNichtGezeigten() throws Exception {
        List<Todo> viele = java.util.stream.IntStream.range(0, 20)
                .mapToObj(i -> todo("Todo " + i, "MEDIUM", false))
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

    private static Todo todo(String title, String priority, boolean done) {
        Todo t = new Todo();
        ReflectionTestUtils.setField(t, "id", UUID.randomUUID());
        t.setTitle(title);
        t.setPriority(priority);
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
