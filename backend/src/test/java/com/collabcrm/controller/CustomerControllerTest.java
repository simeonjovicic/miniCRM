package com.collabcrm.controller;

import com.collabcrm.model.Customer;
import com.collabcrm.service.CrdtSyncService;
import com.collabcrm.service.CustomerService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(CustomerController.class)
class CustomerControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private CustomerService customerService;

    @MockitoBean
    private CrdtSyncService crdtSyncService;

    @MockitoBean
    private org.springframework.messaging.simp.SimpMessagingTemplate messagingTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void getAllCustomers() throws Exception {
        Customer c = new Customer();
        c.setName("Acme");
        when(customerService.findAll()).thenReturn(List.of(c));

        mockMvc.perform(get("/api/customers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Acme"));
    }

    @Test
    void getCustomerById() throws Exception {
        UUID id = UUID.randomUUID();
        Customer c = new Customer();
        c.setName("Acme");
        when(customerService.findById(id)).thenReturn(c);

        mockMvc.perform(get("/api/customers/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Acme"));
    }

    @Test
    void createCustomer() throws Exception {
        Customer c = new Customer();
        c.setName("Acme");
        c.setCreatedBy(UUID.randomUUID());
        when(customerService.create(any())).thenReturn(c);

        mockMvc.perform(post("/api/customers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(c)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Acme"));
    }

    @Test
    void updateCustomer() throws Exception {
        UUID id = UUID.randomUUID();
        Customer c = new Customer();
        c.setName("Acme Corp");
        when(customerService.update(eq(id), any())).thenReturn(c);

        mockMvc.perform(put("/api/customers/{id}", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Acme Corp\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Acme Corp"));
    }

    @Test
    void deleteCustomer() throws Exception {
        UUID id = UUID.randomUUID();

        mockMvc.perform(delete("/api/customers/{id}", id))
                .andExpect(status().isNoContent());

        verify(customerService).delete(id);
    }

    @Test
    void createCustomerInvalidBody() throws Exception {
        mockMvc.perform(post("/api/customers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }
}
