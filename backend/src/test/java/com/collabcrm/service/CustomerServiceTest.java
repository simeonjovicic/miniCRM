package com.collabcrm.service;

import com.collabcrm.model.Customer;
import com.collabcrm.repository.CustomerRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CustomerServiceTest {

    @Mock
    private CustomerRepository customerRepository;

    @InjectMocks
    private CustomerService customerService;

    @Test
    void findAll() {
        Customer c = new Customer();
        c.setName("Acme");
        when(customerRepository.findAll()).thenReturn(List.of(c));

        assertThat(customerService.findAll()).hasSize(1);
    }

    @Test
    void findByIdFound() {
        UUID id = UUID.randomUUID();
        Customer c = new Customer();
        c.setName("Acme");
        when(customerRepository.findById(id)).thenReturn(Optional.of(c));

        assertThat(customerService.findById(id).getName()).isEqualTo("Acme");
    }

    @Test
    void findByIdNotFound() {
        UUID id = UUID.randomUUID();
        when(customerRepository.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> customerService.findById(id))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Customer not found");
    }

    @Test
    void create() {
        Customer c = new Customer();
        c.setName("Acme");
        when(customerRepository.save(c)).thenReturn(c);

        assertThat(customerService.create(c).getName()).isEqualTo("Acme");
        verify(customerRepository).save(c);
    }

    @Test
    void updatePartialFields() {
        UUID id = UUID.randomUUID();
        Customer existing = new Customer();
        existing.setName("Acme");
        existing.setStatus("LEAD");
        existing.setEmail("old@acme.com");

        Customer updates = new Customer();
        updates.setName("Acme Corp");
        updates.setStatus("PROSPECT");

        when(customerRepository.findById(id)).thenReturn(Optional.of(existing));
        when(customerRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Customer result = customerService.update(id, updates);
        assertThat(result.getName()).isEqualTo("Acme Corp");
        assertThat(result.getStatus()).isEqualTo("PROSPECT");
        assertThat(result.getEmail()).isEqualTo("old@acme.com"); // unchanged
    }

    @Test
    void delete() {
        UUID id = UUID.randomUUID();
        customerService.delete(id);
        verify(customerRepository).deleteById(id);
    }
}
