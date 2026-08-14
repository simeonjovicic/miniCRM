package com.collabcrm.controller;

import com.collabcrm.model.TodoComment;
import com.collabcrm.service.TodoService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(TodoController.class)
// Prueft Controller-Logik, nicht die Anmeldung — die hat eigene Tests.
@AutoConfigureMockMvc(addFilters = false)
class TodoControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private TodoService todoService;

    @MockitoBean
    private org.springframework.messaging.simp.SimpMessagingTemplate messagingTemplate;

    /**
     * Die todoId kommt aus dem Pfad, nicht aus dem Body. Waere sie am Modell als
     * Pflichtfeld annotiert, wuerde die Eingangsvalidierung mit 400 abbrechen,
     * bevor der Service sie setzen kann.
     */
    @Test
    void kommentarBrauchtKeineTodoIdImBody() throws Exception {
        UUID todoId = UUID.randomUUID();
        when(todoService.addComment(eq(todoId), any())).thenAnswer(inv -> inv.getArgument(1));

        mockMvc.perform(post("/api/todos/" + todoId + "/comments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"text":"hab die Zahlen geschickt",
                                 "createdBy":"%s","createdByUsername":"bob"}
                                """.formatted(UUID.randomUUID())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.text").value("hab die Zahlen geschickt"));
    }

    @Test
    void leererKommentarWirdAbgelehnt() throws Exception {
        mockMvc.perform(post("/api/todos/" + UUID.randomUUID() + "/comments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"text":"   ","createdBy":"%s"}
                                """.formatted(UUID.randomUUID())))
                .andExpect(status().isBadRequest());

        verify(todoService, never()).addComment(any(), any());
    }

    @Test
    void kommentareEinesTodosWerdenGeliefert() throws Exception {
        UUID todoId = UUID.randomUUID();
        TodoComment comment = new TodoComment();
        comment.setTodoId(todoId);
        comment.setText("passt");
        comment.setCreatedBy(UUID.randomUUID());
        when(todoService.findComments(todoId)).thenReturn(List.of(comment));

        mockMvc.perform(get("/api/todos/" + todoId + "/comments"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].text").value("passt"));
    }

    @Test
    void kommentarLoeschenGibtNoContent() throws Exception {
        UUID todoId = UUID.randomUUID();
        UUID commentId = UUID.randomUUID();

        mockMvc.perform(delete("/api/todos/" + todoId + "/comments/" + commentId))
                .andExpect(status().isNoContent());

        verify(todoService).deleteComment(commentId);
    }
}
