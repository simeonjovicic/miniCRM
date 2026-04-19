package com.collabcrm.service;

import com.collabcrm.model.Customer;
import com.collabcrm.repository.CustomerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Service für Kunden-CRUD-Operationen.
 *
 * @Transactional: Alle Methoden laufen in einer Datenbank-Transaktion.
 * Wenn eine Exception fliegt, werden alle Änderungen zurückgerollt.
 */
@Service
@Transactional
public class CustomerService {

    private final CustomerRepository customerRepository;

    public CustomerService(CustomerRepository customerRepository) {
        this.customerRepository = customerRepository;
    }

    public List<Customer> findAll() {
        return customerRepository.findAll();
    }

    public Customer findById(UUID id) {
        return customerRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Customer not found: " + id));
    }

    public Customer create(Customer customer) {
        return customerRepository.save(customer);
    }

    /**
     * Aktualisiert nur die Felder die nicht null sind (Partial Update).
     * So kann der CrdtSyncService einzelne Felder aktualisieren ohne andere zu überschreiben.
     */
    public Customer update(UUID id, Customer updates) {
        Customer existing = findById(id);
        if (updates.getName() != null) existing.setName(updates.getName());
        if (updates.getEmail() != null) existing.setEmail(updates.getEmail());
        if (updates.getCompany() != null) existing.setCompany(updates.getCompany());
        if (updates.getPhone() != null) existing.setPhone(updates.getPhone());
        if (updates.getAddress() != null) existing.setAddress(updates.getAddress());
        if (updates.getStatus() != null) existing.setStatus(updates.getStatus());
        return customerRepository.save(existing);
    }

    public void delete(UUID id) {
        customerRepository.deleteById(id);
    }
}
