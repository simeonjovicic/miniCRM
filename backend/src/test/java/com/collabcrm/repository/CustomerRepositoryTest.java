package com.collabcrm.repository;

import com.collabcrm.model.Customer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class CustomerRepositoryTest {

    @Autowired
    private CustomerRepository customerRepository;

    @Test
    void saveAndFindById() {
        Customer customer = newCustomer("Acme Corp", "LEAD");
        Customer saved = customerRepository.save(customer);

        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getCreatedAt()).isNotNull();
        assertThat(saved.getStatus()).isEqualTo("LEAD");
    }

    @Test
    void findByStatus() {
        customerRepository.save(newCustomer("Acme Corp", "LEAD"));
        customerRepository.save(newCustomer("Globex", "CUSTOMER"));
        customerRepository.save(newCustomer("Initech", "LEAD"));

        List<Customer> leads = customerRepository.findByStatus("LEAD");
        assertThat(leads).hasSize(2);
        assertThat(leads).extracting(Customer::getName)
                .containsExactlyInAnyOrder("Acme Corp", "Initech");
    }

    @Test
    void findByNameContainingIgnoreCase() {
        customerRepository.save(newCustomer("Acme Corp", "LEAD"));
        customerRepository.save(newCustomer("Acme Labs", "PROSPECT"));
        customerRepository.save(newCustomer("Globex", "CUSTOMER"));

        List<Customer> results = customerRepository.findByNameContainingIgnoreCase("acme");
        assertThat(results).hasSize(2);
    }

    @Test
    void defaultStatusIsLead() {
        Customer customer = new Customer();
        customer.setName("Test");
        customer.setCreatedBy(UUID.randomUUID());
        Customer saved = customerRepository.save(customer);

        assertThat(saved.getStatus()).isEqualTo("LEAD");
    }

    private Customer newCustomer(String name, String status) {
        Customer customer = new Customer();
        customer.setName(name);
        customer.setStatus(status);
        customer.setCreatedBy(UUID.randomUUID());
        return customer;
    }
}
