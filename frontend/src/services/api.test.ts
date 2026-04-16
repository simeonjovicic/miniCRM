import { usersApi, customersApi } from "./api";
import { mockFetch } from "../test/helpers";
import { testUser, testCustomer } from "../test/fixtures";

describe("usersApi", () => {
  let restore: () => void;

  afterEach(() => restore?.());

  it("lists users", async () => {
    ({ restore } = mockFetch({ "/users": [testUser] }));
    const users = await usersApi.list();
    expect(users).toHaveLength(1);
    expect(users[0].username).toBe("alice");
  });

  it("gets a user by id", async () => {
    ({ restore } = mockFetch({ "/users/u-1": testUser }));
    const user = await usersApi.get("u-1");
    expect(user.email).toBe("alice@example.com");
  });

  it("creates a user", async () => {
    ({ restore } = mockFetch({ "POST /users": testUser }));
    const user = await usersApi.create({
      username: "alice",
      email: "alice@example.com",
      role: "ADMIN",
    });
    expect(user.id).toBe("u-1");
  });
});

describe("customersApi", () => {
  let restore: () => void;

  afterEach(() => restore?.());

  it("lists customers", async () => {
    ({ restore } = mockFetch({ "/customers": [testCustomer] }));
    const customers = await customersApi.list();
    expect(customers).toHaveLength(1);
    expect(customers[0].name).toBe("Acme Corp");
  });

  it("gets a customer by id", async () => {
    ({ restore } = mockFetch({ "/customers/c-1": testCustomer }));
    const customer = await customersApi.get("c-1");
    expect(customer.company).toBe("Acme");
  });

  it("creates a customer", async () => {
    ({ restore } = mockFetch({ "POST /customers": testCustomer }));
    const customer = await customersApi.create({ name: "Acme Corp" });
    expect(customer.status).toBe("LEAD");
  });

  it("updates a customer", async () => {
    const updated = { ...testCustomer, name: "Acme Inc" };
    ({ restore } = mockFetch({ "PUT /customers/c-1": updated }));
    const customer = await customersApi.update("c-1", { name: "Acme Inc" });
    expect(customer.name).toBe("Acme Inc");
  });

  it("deletes a customer", async () => {
    ({ restore } = mockFetch({ "DELETE /customers/c-1": undefined }));
    await expect(customersApi.delete("c-1")).resolves.toBeUndefined();
  });

  it("throws on error response", async () => {
    ({ restore } = mockFetch({}));
    await expect(customersApi.get("nonexistent")).rejects.toThrow("404");
  });
});
